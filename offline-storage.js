/* Lossless device storage. Cache v2 keeps gzip internally; visitors receive
 * the original body, MIME and hash. No content or photograph is omitted. */
(function(scope){
  const codec='gzip-v1',marker='X-Godune-Storage',lengthHeader='X-Godune-Stored-Bytes';
  const available=()=>typeof CompressionStream==='function' && typeof DecompressionStream==='function';
  const compressible=(path,bytes)=>bytes>=1024 && /\.(html|css|js|mjs|json|geojson|svg|pbf|wasm|gpx|txt|md|ttf)$/.test(path);
  function clean(headers){const result=new Headers(headers);for(const name of [marker,lengthHeader,'Content-Encoding','Content-Length'])result.delete(name);return result;}
  async function encode(body,headers,path){
    let stored=body,compressed=false;
    if(available() && compressible(path,body.byteLength)){
      const stream=new Response(body).body.pipeThrough(new CompressionStream('gzip'));
      const zipped=new Uint8Array(await new Response(stream).arrayBuffer());
      if(zipped.byteLength<body.byteLength){stored=zipped;compressed=true;}
    }
    const out=clean(headers);out.set(lengthHeader,String(stored.byteLength));if(compressed)out.set(marker,codec);
    return {response:new Response(stored,{headers:out}),bytes:stored.byteLength,compressed};
  }
  async function decode(response,resource){
    const encoding=response.headers.get(marker),stored=new Uint8Array(await response.arrayBuffer());
    if(!encoding)return {body:stored,headers:clean(response.headers),stored_bytes:stored.byteLength};
    if(encoding!==codec || typeof DecompressionStream!=='function' || stored.byteLength>=resource.bytes)throw new Error('Не удалось проверить сохранённый файл.');
    const reader=new Blob([stored]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];let length=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>resource.bytes)throw new Error('Сохранённый файл больше ожидаемого.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    if(length!==resource.bytes)throw new Error('Сохранённый файл оборвался.');
    const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
    return {body,headers:clean(response.headers),stored_bytes:stored.byteLength};
  }
  async function restore(response,resource,digest){
    if(!response.headers.has(marker))return response;
    const decoded=await decode(response,resource);if(await digest(decoded.body)!==resource.sha256)throw new Error('Сохранённый файл не прошёл проверку.');
    return new Response(decoded.body,{headers:decoded.headers});
  }
  scope.GoduneStorage={available,compressible,encode,decode,restore};
  if(typeof module!=='undefined')module.exports=scope.GoduneStorage;
})(globalThis);
