import { sendRequest } from '@/providers/sources/showbox/sendRequest';
import { StreamFile } from '@/providers/streams';
import { ScrapeContext } from '@/utils/context';

const allowedQualities = ['360', '480', '720', '1080', '4k'];

export async function getStreamQualities(ctx: ScrapeContext, apiQuery: object) {
  const mediaRes: { list: { path: string; quality: string; fid?: number }[] } = (await sendRequest(ctx, apiQuery)).data;

  const qualityMap = mediaRes.list
    .filter((file) => allowedQualities.includes(file.quality.replace('p', '')))
    .map((file) => ({
      url: file.path,
      quality: file.quality.replace('p', ''),
    }));

  const qualities: Record<string, StreamFile> = {};

  allowedQualities.forEach((quality) => {
    const foundQuality = qualityMap.find((q) => q.quality === quality);
    if (foundQuality && foundQuality.url) {
      qualities[quality] = {
        type: 'mp4',
        url: foundQuality.url,
      };
    }
  });

  return {
    qualities,
    fid: mediaRes.list[0]?.fid,
  };
}