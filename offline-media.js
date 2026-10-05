/* A stored, verified complete MP3 can answer the byte requests of mobile players. */
globalThis.GoduneMedia = {
  async range(response, header) {
    if (!header) return response;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match || !match[1] && !match[2]) return response;
    const body = await response.arrayBuffer(), size = body.byteLength;
    let start, end;
    if (match[1]) {
      start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    } else {
      start = Math.max(0, size - Number(match[2])); end = size - 1;
    }
    const headers = new Headers(response.headers);
    headers.set('Accept-Ranges', 'bytes');
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      headers.set('Content-Range', `bytes */${size}`); headers.set('Content-Length', '0');
      return new Response(null, {status:416, headers});
    }
    end = Math.min(end, size - 1);
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(body.slice(start, end + 1), {status:206, headers});
  }
};
