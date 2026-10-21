/**
 * OpenAPI 3 document for the public read API, generated from the shared Zod schemas so the
 * documentation cannot drift from the code. Served at /api/openapi.json (docs/api.md).
 * Auth endpoints are documented in docs/api.md and join this document in a later phase.
 */
import {
  pageOf,
  publicClubSchema,
  publicDirectoryQuerySchema,
  publicPlayerSchema,
  publicTournamentQuerySchema,
  publicTournamentSchema,
  publicTournamentSummarySchema,
  publicVenueSchema,
  publicVenueRefSchema,
} from '@tourneasy/shared';
import type { ZodObject, ZodRawShape, ZodTypeAny } from 'zod';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const schema = (s: ZodTypeAny) => zodToJsonSchema(s, { target: 'openApi3', $refStrategy: 'none' });

function queryParameters(s: ZodObject<ZodRawShape>) {
  const json = schema(s) as { properties?: Record<string, object> };
  return Object.entries(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: 'query',
    required: false,
    schema: prop,
  }));
}

const pathParam = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string' },
});

const ok = (description: string, s: ZodTypeAny) => ({
  200: { description, content: { 'application/json': { schema: schema(s) } } },
  304: { description: 'Not modified (matching If-None-Match)' },
});
const notFound = { 404: { $ref: '#/components/responses/Error' } };

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Tourneasy API',
      version: '1.0.0',
      description:
        'Public read API for tournaments, venues, clubs and players. Conventions (errors, caching, versioning): docs/api.md.',
    },
    servers: [{ url: serverUrl }],
    paths: {
      '/api/v1/tournaments': {
        get: {
          summary: 'Published tournaments',
          parameters: queryParameters(publicTournamentQuerySchema),
          responses: ok('A page of tournaments', pageOf(publicTournamentSummarySchema)),
        },
      },
      '/api/v1/tournaments/{slug}': {
        get: {
          summary: 'Tournament details',
          parameters: [pathParam('slug', 'Tournament slug')],
          responses: { ...ok('Tournament', publicTournamentSchema), ...notFound },
        },
      },
      '/api/v1/tournaments/{slug}/calendar.ics': {
        get: {
          summary: 'Tournament days as an iCalendar event',
          parameters: [pathParam('slug', 'Tournament slug')],
          responses: {
            200: { description: 'iCalendar file', content: { 'text/calendar': {} } },
            ...notFound,
          },
        },
      },
      '/api/v1/venues': {
        get: {
          summary: 'Venues',
          parameters: queryParameters(publicDirectoryQuerySchema),
          responses: ok('A page of venues', pageOf(publicVenueSchema)),
        },
      },
      '/api/v1/venues/{slug}': {
        get: {
          summary: 'Venue with upcoming tournaments and home clubs',
          parameters: [pathParam('slug', 'Venue slug')],
          responses: {
            ...ok(
              'Venue',
              z.object({
                venue: publicVenueSchema,
                tournaments: z.array(publicTournamentSummarySchema),
                clubs: z.array(z.object({ slug: z.string(), name: z.string() })),
              }),
            ),
            ...notFound,
          },
        },
      },
      '/api/v1/clubs': {
        get: {
          summary: 'Clubs',
          parameters: queryParameters(publicDirectoryQuerySchema),
          responses: ok('A page of clubs', pageOf(publicClubSchema)),
        },
      },
      '/api/v1/clubs/{slug}': {
        get: {
          summary: 'Club with its public players',
          parameters: [pathParam('slug', 'Club slug')],
          responses: {
            ...ok(
              'Club',
              z.object({ club: publicClubSchema, players: z.array(publicPlayerSchema) }),
            ),
            ...notFound,
          },
        },
      },
      '/api/v1/players': {
        get: {
          summary: 'Players with a public profile',
          parameters: queryParameters(publicDirectoryQuerySchema.omit({ province: true })),
          responses: ok('A page of players', pageOf(publicPlayerSchema)),
        },
      },
      '/api/v1/players/{memberNumber}': {
        get: {
          summary: 'Public player profile',
          description: 'Signed-in callers also receive `following` and `isSelf`.',
          parameters: [pathParam('memberNumber', 'Member number, e.g. TE100001')],
          responses: {
            ...ok(
              'Player',
              z.object({
                player: publicPlayerSchema,
                following: z.boolean().optional(),
                isSelf: z.boolean().optional(),
              }),
            ),
            ...notFound,
          },
        },
      },
      '/api/v1/players/{memberNumber}/follow': {
        put: {
          summary: 'Follow a player',
          security: [{ bearer: [] }],
          parameters: [pathParam('memberNumber', 'Member number')],
          responses: { 204: { description: 'Following' }, ...notFound },
        },
        delete: {
          summary: 'Stop following a player',
          security: [{ bearer: [] }],
          parameters: [pathParam('memberNumber', 'Member number')],
          responses: { 204: { description: 'Not following' } },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { VenueRef: schema(publicVenueRefSchema) },
      responses: {
        Error: {
          description: 'Error (docs/api.md "Error format")',
          content: {
            'application/json': {
              schema: schema(
                z.object({
                  error: z.object({
                    code: z.string(),
                    message: z.string(),
                    details: z.record(z.unknown()),
                    requestId: z.string(),
                  }),
                }),
              ),
            },
          },
        },
      },
    },
  };
}
