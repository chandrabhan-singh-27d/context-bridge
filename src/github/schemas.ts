import { z } from 'zod';

export const slugSegment = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
    'must be a valid GitHub slug segment (alphanumeric start/end, may contain ._-)',
  );

export const repoCoordsSchema = {
  owner: slugSegment,
  repo: slugSegment,
};

export interface RepoCoords {
  readonly owner: string;
  readonly repo: string;
}

export const issueNumber = z.number().int().positive().max(10_000_000);
