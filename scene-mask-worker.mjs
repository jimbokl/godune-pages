import {rasterizeSceneMasks} from './scene-mask.mjs';
self.onmessage = async ({data: {id, profile, width, height}}) => {
  try {
    const pixels = await rasterizeSceneMasks(profile, width, height, async () => {});
    self.postMessage({id, buffer: pixels.buffer}, [pixels.buffer]);
  } catch (error) {
    self.postMessage({id, error: error.message});
  }
};
