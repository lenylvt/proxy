// app/api/videoProxy/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';
import { LRUCache } from 'lru-cache';
import { PassThrough } from 'stream';

const cache = new LRUCache({
  max: 500,
  maxAge: 1000 * 60 * 60 // 1 hour
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const referer = "https://sekai.one/";

  if (!url) {
    return NextResponse.json({ error: 'Le paramètre URL est requis' }, { status: 400 });
  }

  const range = request.headers.get('range');
  const cacheKey = ${url}-${range || 'full'};
  const cachedHeaders = cache.get(cacheKey);

  const headers = {
    Referer: referer,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
    Range: range || 'bytes=0-',
  };

  if (cachedHeaders && !range) {
    console.log('Using cached headers for:', url);
    headers['If-None-Match'] = cachedHeaders.etag;
  }

  try {
    console.time(Fetch ${url});
    const response = await axios.get(url, {
      headers,
      responseType: 'stream',
      timeout: 60000, // 60 seconds timeout
      validateStatus: function (status) {
        return status >= 200 && status < 300 || status === 206 || status === 304;
      },
    });
    console.timeEnd(Fetch ${url});

    console.log('Statut de la réponse:', response.status);
    console.log('En-têtes de la réponse:', response.headers);

    const stream = new PassThrough();
    response.data.pipe(stream);

    const newResponse = new NextResponse(stream, { status: response.status });

    ['content-type', 'content-length', 'accept-ranges', 'content-range', 'etag', 'cache-control'].forEach(header => {
      if (response.headers[header]) {
        newResponse.headers.set(header, response.headers[header]);
      }
    });

    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');

    if (response.status !== 304) {
      cache.set(cacheKey, {
        etag: response.headers.etag,
        'content-type': response.headers['content-type'],
        'content-length': response.headers['content-length'],
        'accept-ranges': response.headers['accept-ranges'],
        'cache-control': response.headers['cache-control']
      });
    }

    return newResponse;
  } catch (error) {
    console.error('Erreur dans videoProxy:', error);

   // Handle timeout specifically
    if (error.code === 'ECONNABORTED') {
      return NextResponse.json({ error: 'Timeout: La vidéo prend trop de temps à charger.' }, { status: 504 });
    }

    // Handle cancellation error
    if (axios.isCancel(error)) {
      return NextResponse.json({ error: 'Requête annulée' }, { status: 499 });
    }

    return NextResponse.json({ status: Une erreur est survenue : ${error.message}, error: error.toString() }, { status: 500 });
  }
}