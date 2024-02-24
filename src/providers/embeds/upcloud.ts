import axios from 'axios';
import crypto from 'crypto-js';

import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { Caption, getCaptionTypeFromUrl, labelToLanguageCode } from '@/providers/captions';

const origin = 'https://rabbitstream.net';
const referer = 'https://rabbitstream.net/';

const { AES, enc } = crypto;

interface StreamRes {
  server: number;
  sources: string;
  tracks: {
    file: string;
    kind: 'captions' | 'thumbnails';
    label: string;
  }[];
}

function isJSON(json: string) {
  try {
    JSON.parse(json);
    return true;
  } catch {
    return false;
  }
}

/*
example script segment:
switch(I9){case 0x0:II=X,IM=t;break;case 0x1:II=b,IM=D;break;case 0x2:II=x,IM=f;break;case 0x3:II=S,IM=j;break;case 0x4:II=U,IM=G;break;case 0x5:II=partKeyStartPosition_5,IM=partKeyLength_5;}
*/
function extractKey(script: string): [number, number][] | null {
  const startOfSwitch = script.lastIndexOf('switch');
  const endOfCases = script.indexOf('partKeyStartPosition');
  const switchBody = script.slice(startOfSwitch, endOfCases);

  const nums: [number, number][] = [];
  const matches = switchBody.matchAll(/:[a-zA-Z0-9]+=([a-zA-Z0-9]+),[a-zA-Z0-9]+=([a-zA-Z0-9]+);/g);
  for (const match of matches) {
    const innerNumbers: number[] = [];
    for (const varMatch of [match[1], match[2]]) {
      const regex = new RegExp(`${varMatch}=0x([a-zA-Z0-9]+)`, 'g');
      const varMatches = [...script.matchAll(regex)];
      const lastMatch = varMatches[varMatches.length - 1];
      if (!lastMatch) return null;
      const number = parseInt(lastMatch[1], 16);
      innerNumbers.push(number);
    }

    nums.push([innerNumbers[0], innerNumbers[1]]);
  }

  return nums;
}

function convertTo2DArray(data: string): number[][] {
  // Split the string by commas and convert each part to a number
  const numbers: number[] = data.split(',').map(Number);

  // Check if the number of elements is even, if not, remove the last element
  if (numbers.length % 2 !== 0) {
    numbers.pop();
  }

  // Create a 2D array by grouping every two consecutive numbers
  const result: number[][] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    result.push([numbers[i], numbers[i + 1]]);
  }
  console.log(`RESULT ${result}`);
  return result;
}

const isJson = (str: string) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

export const upcloudScraper = makeEmbed({
  id: 'upcloud',
  name: 'UpCloud',
  rank: 200,
  async scrape(ctx) {
    // Example url: https://dokicloud.one/embed-4/{id}?z=
    const parsedUrl = new URL(ctx.url.replace('embed-5', 'embed-4'));

    const dataPath = parsedUrl.pathname.split('/');
    const dataId = dataPath[dataPath.length - 1];

    const streamRes = await ctx.proxiedFetcher<StreamRes>(`${parsedUrl.origin}/ajax/embed-4/getSources?id=${dataId}`, {
      headers: {
        Referer: parsedUrl.origin,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    let sources: { file: string; type: string } | null = null;

    if (!isJSON(streamRes.sources)) {
      const k = await axios.get('https://keys4.fun');
      const decryptionKey = convertTo2DArray(k.data.rabbitstream.keys);
      if (!decryptionKey) throw new Error('Key extraction failed');
      const keyString = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(k.data.rabbitstream.keys))));
      const decryptedVal = CryptoJS.AES.decrypt(streamRes.sources, keyString).toString(CryptoJS.enc.Utf8);
      sources = isJSON(decryptedVal) ? JSON.parse(streamRes.sources) : streamRes.sources;
    }

    if (!sources) throw new Error('upcloud source not found');

    const captions: Caption[] = [];
    streamRes.tracks.forEach((track) => {
      if (track.kind !== 'captions') return;
      const type = getCaptionTypeFromUrl(track.file);
      if (!type) return;
      const language = labelToLanguageCode(track.label);
      if (!language) return;
      captions.push({
        id: track.file,
        language,
        hasCorsRestrictions: false,
        type,
        url: track.file,
      });
    });

    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: sources.file,
          flags: [flags.CORS_ALLOWED],
          captions,
          preferredHeaders: {
            Referer: referer,
            Origin: origin,
          },
        },
      ],
    };
  },
});
