import { z } from 'zod';
import { issueNumber, slugSegment } from '../../github/schemas.ts';

export const repoCoords = {
  owner: slugSegment,
  repo: slugSegment,
};

export const issueCoords = {
  ...repoCoords,
  number: issueNumber,
};

export const commentBody = z.string().min(1).max(65_536);

export const labelName = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[^\s,]+(?:[\s][^\s,]+)*$/, 'label may not contain commas');

export const labelList = z.array(labelName).min(1).max(20);

export const branchName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\s~^:?*[\\]+$/, 'invalid git ref characters');

export const filePath = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !p.startsWith('/') && !p.includes('..'), {
    message: 'must be a relative path without ".." segments',
  });

export const fileContent = z.string().max(5_000_000);

export const fileEntry = z.object({
  path: filePath,
  content: fileContent,
});

export const commitMessage = z.string().min(1).max(72_000);

export const prTitle = z.string().min(1).max(256);
export const prBody = z.string().max(65_536);
