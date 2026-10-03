/* Standard USTAR+gzip transport. Files become ordinary verified cache responses. */
(function(scope) {
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const safePath=path=>typeof path==='string' && path.length>0 && !/^[/.]|[\\?#%\x00-\x1f]|:/.test(path) && !path.split('/').some(part=>!part || part==='.' || part==='..');
  const digest=async body=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(n=>n.toString(16).padStart(2,'0')).join('');
  async function unpack(compressed,expected,onFile,{signal}={}) {
    if(typeof DecompressionStream!=='function')throw new Error('Этот браузер пока не распаковывает карту. Обновите браузер или скачайте отдельную прогулку.');
    const files=new Map(expected.map(r=>[r.path,r])),seen=new Set();
    if(files.size!==expected.length || expected.some(r=>!safePath(r.path)))throw new Error('Неверный список файлов карты.');
    const limit=Math.ceil((expected.reduce((n,r)=>n+512+Math.ceil(r.bytes/512)*512,0)+1024)/10240)*10240;
    const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    let pending=new Uint8Array(),total=0;
    const aborted=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
    async function next(){aborted();const {done,value}=await reader.read();aborted();if(done)return null;total+=value.length;if(total>limit)throw new Error('Архив карты больше ожидаемого.');return value;}
    async function take(n){const out=new Uint8Array(n);let offset=0;while(offset<n){if(!pending.length){pending=await next();if(!pending)throw new Error('Архив карты оборвался.');}const length=Math.min(n-offset,pending.length);out.set(pending.subarray(0,length),offset);offset+=length;pending=pending.subarray(length);}return out;}
    const text=bytes=>{const end=bytes.indexOf(0);return decoder.decode(end<0?bytes:bytes.subarray(0,end));};
    const number=bytes=>{const value=text(bytes).trim();if(!/^[0-7]+$/.test(value))throw new Error('Неверный заголовок архива карты.');const n=parseInt(value,8);if(!Number.isSafeInteger(n))throw new Error('Неверный размер файла карты.');return n;};
    try {
      while(true){
        aborted();const header=await take(512);
        if(header.every(n=>n===0)){
          if(!(await take(512)).every(n=>n===0))throw new Error('Неверный конец архива карты.');
          if(seen.size!==files.size)throw new Error('В архиве не хватает файлов карты.');
          if(pending.some(n=>n!==0))throw new Error('Лишние данные в архиве карты.');
          for(let tail=await next();tail;tail=await next())if(tail.some(n=>n!==0))throw new Error('Лишние данные в архиве карты.');
          return seen.size;
        }
        const checksum=header.reduce((sum,n,i)=>sum+(i>=148 && i<156?32:n),0);
        if(checksum!==number(header.subarray(148,156)) || text(header.subarray(257,263))!=='ustar' || ![0,48].includes(header[156]) || text(header.subarray(157,257)))throw new Error('Не удалось проверить заголовок архива карты.');
        const prefix=text(header.subarray(345,500)),name=text(header.subarray(0,100)),path=prefix?`${prefix}/${name}`:name;
        const resource=files.get(path),length=number(header.subarray(124,136));
        if(!safePath(path) || !resource || seen.has(path) || length!==resource.bytes)throw new Error('Состав архива карты изменился.');
        const body=await take(length),padding=(512-length%512)%512;
        if(padding && (await take(padding)).some(n=>n!==0))throw new Error('Неверное заполнение архива карты.');
        if(await digest(body)!==resource.sha256)throw new Error('Файл карты не прошёл проверку.');
        aborted();await onFile(resource,body);seen.add(path);
      }
    } finally {await reader.cancel().catch(()=>{});}
  }
  scope.GoduneArchive={safePath,digest,unpack};
  if(typeof module!=='undefined')module.exports=scope.GoduneArchive;
})(globalThis);
