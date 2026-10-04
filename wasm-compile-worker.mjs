// Compile one module away from the page. The instance and its memory remain
// with the caller; no trip data is sent to this worker or to a server.
self.onmessage = async ({data:{bytes}}) => {
  const started = performance.timeOrigin + performance.now();
  try {
    const module = await WebAssembly.compile(bytes);
    self.postMessage({module, started, finished:performance.timeOrigin + performance.now()});
  } catch (error) {
    self.postMessage({error:error.message});
  }
};
