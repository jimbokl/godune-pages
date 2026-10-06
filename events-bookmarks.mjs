// A tiny local collection. A successful write is confirmed before updating the UI.
export const BOOKMARK_KEY='godune-events:v1';
const validId=id=>typeof id==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
export function readBookmarks(storage){
 const raw=storage.getItem(BOOKMARK_KEY);if(raw===null)return new Set();
 const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.ids)||!data.ids.every(validId))throw new TypeError('Invalid saved events');
 return new Set(data.ids);
}
export function writeBookmarks(storage,ids){
 const list=[...ids].sort();if(!list.every(validId))throw new TypeError('Invalid event id');
 const raw=JSON.stringify({version:1,ids:list});storage.setItem(BOOKMARK_KEY,raw);
 if(storage.getItem(BOOKMARK_KEY)!==raw)throw new Error('Saved events were not persisted');
 return new Set(list);
}
