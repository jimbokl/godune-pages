// Share successful catalog reads; a failed request must not poison later attempts.
export function createJsonLoader(url, {fetch:fetcher=globalThis.fetch,
  delays=[350,1000], sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  let request;
  return function load() {
    if (!request) request=(async()=>{
      for(let attempt=0;;attempt++) {
        let retryable=true;
        try {
          const response=await fetcher(url,{cache:'no-cache'});
          if (!response.ok) {
            retryable=response.status===408||response.status===429||response.status>=500;
            throw new Error(`Каталог временно недоступен (${response.status})`);
          }
          return await response.json();
        } catch(error) {
          if (!retryable||attempt>=delays.length) throw error;
          await sleep(delays[attempt]);
        }
      }
    })().catch(error=>{request=undefined;throw error;});
    return request;
  };
}
