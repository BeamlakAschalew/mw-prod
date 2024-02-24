import axios from 'axios';

import { makeFullUrl } from '@/fetchers/common';
import { decodeData } from '@/providers/sources/vidsrcto/common';
import { EmbedScrapeContext } from '@/utils/context';

export const vidplayBase = 'https://vidplay.online';
export const referer = `${vidplayBase}/`;

// This file is based on https://github.com/Ciarands/vidsrc-to-resolver/blob/dffa45e726a4b944cb9af0c9e7630476c93c0213/vidsrc.py#L16
// Full credits to @Ciarands!

export const getDecryptionKeys = async (): Promise<string[]> => {
  const res = (await axios.get('https://keys4.fun')).data.vidplay.keys;
  if (!res) throw new Error('No keys found');
  return res;
};

export const getEncodedId = async (ctx: EmbedScrapeContext) => {
  const url = new URL(ctx.url);
  const id = url.pathname.replace('/e/', '');
  const keyList = await getDecryptionKeys();

  const decodedId = decodeData(keyList[0], id);
  const encodedResult = decodeData(keyList[1], decodedId);
  const b64encoded = btoa(encodedResult);
  return b64encoded.replace('/', '_');
};

export const getFuTokenKey = async (ctx: EmbedScrapeContext) => {
  const id = await getEncodedId(ctx);
  const fuTokenRes = await ctx.proxiedFetcher<string>('/futoken', {
    baseUrl: vidplayBase,
    headers: {
      referer: ctx.url,
    },
  });
  const fuKey = fuTokenRes.match(/var\s+k\s*=\s*'([^']+)'/)?.[1];
  if (!fuKey) throw new Error('No fuKey found');
  const tokens = [];
  for (let i = 0; i < id.length; i += 1) {
    tokens.push(fuKey.charCodeAt(i % fuKey.length) + id.charCodeAt(i));
  }
  return `${fuKey},${tokens.join(',')}`;
};

export const getFileUrl = async (ctx: EmbedScrapeContext) => {
  const fuToken = await getFuTokenKey(ctx);
  return makeFullUrl(`/mediainfo/${fuToken}`, {
    baseUrl: vidplayBase,
    query: {
      ...Object.fromEntries(new URL(ctx.url).searchParams.entries()),
      autostart: 'true',
    },
  });
};
