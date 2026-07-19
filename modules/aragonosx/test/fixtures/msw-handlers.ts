import { HttpResponse, http } from "@evmcrispr/test-utils/msw/server";
import {
  DAO_ADDRESS,
  DAO_SUBDOMAIN,
  SUBGRAPH_DAO,
  SUBGRAPH_URL,
} from "../fixtures";

export const aragonosxHandlers = [
  http.post(SUBGRAPH_URL, async ({ request }) => {
    const body = (await request.json()) as {
      query: string;
      variables: Record<string, any>;
    };
    const query = body.query || "";
    const variables = body.variables || {};

    if (query.includes("query DaoData")) {
      const isFixtureDao =
        String(variables.id).toLowerCase() === DAO_ADDRESS.toLowerCase();
      return HttpResponse.json({
        data: { dao: isFixtureDao ? SUBGRAPH_DAO : null },
      });
    }

    if (query.includes("query DaoBySubdomain")) {
      return HttpResponse.json({
        data: {
          daos:
            variables.subdomain === DAO_SUBDOMAIN ? [{ id: DAO_ADDRESS }] : [],
        },
      });
    }

    return HttpResponse.json({
      errors: [{ message: `unexpected query: ${query.slice(0, 60)}` }],
    });
  }),
];
