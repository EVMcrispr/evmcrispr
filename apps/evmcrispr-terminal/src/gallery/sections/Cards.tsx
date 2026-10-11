import { Badge, Button, Card, Time, Well } from "@repo/ui";
import { useState } from "react";
import { Both, Example, Section } from "../kit";

const NOW = Date.now();
const CODE = `# Swap on Gnosis
set $amount 250e18
exec @token(WXDAI) approve @router $amount
exec @router swapExactTokensForTokens $amount 0 [@token(WXDAI),@token(GNO)] @me`;
const LOGS = `> Approving 250 WXDAI to the router
> Swapping 250 WXDAI for GNO
  expected 1.84 GNO, minimum 1.82`;

export function Cards() {
  const [first, setFirst] = useState(false);
  const [second, setSecond] = useState(false);
  return (
    <Section
      id="cards"
      title="Cards and wells"
      note="A card is a framed block with a hard shadow. Its tone is neutral unless the whole card is in a state the reader must notice."
    >
      <Both>
        <Example label="collapsible: closed, finished">
          <div className="w-full">
            <Card
              aria-label="Simulation, succeeded"
              open={first}
              onOpenChange={setFirst}
            >
              <Card.Header
                title="Simulation"
                status={<Badge tone="success">succeeded</Badge>}
                time={<Time at={NOW - 3_600_000} now={NOW} format="clock" />}
              />
              <Card.Body>
                <Well>{LOGS}</Well>
              </Card.Body>
            </Card>
          </div>
        </Example>
        <Example label="collapsible, running: the latest log line beside Stop; clicking it folds and unfolds">
          <div className="w-full">
            <Card
              aria-label="Run, running"
              open={second}
              onOpenChange={setSecond}
            >
              <Card.Header
                title="Run"
                status={
                  <Badge tone="success" dot>
                    running
                  </Badge>
                }
                time={<Time at={NOW - 60_000} now={NOW} format="clock" />}
              />
              <Card.Body>
                <Well>{LOGS}</Well>
              </Card.Body>
              <Card.Footer summary="expected 1.84 GNO, minimum 1.82">
                <Button variant="neutral" size="sm">
                  Stop
                </Button>
              </Card.Footer>
            </Card>
          </div>
        </Example>
        <Example label="tone warning: paused, with a footer">
          <div className="w-full">
            <Card tone="warning" aria-label="Run, paused">
              <Card.Header
                title="Run"
                status={
                  <Badge tone="warning" dot>
                    paused
                  </Badge>
                }
                time={<Time at={NOW - 420_000} now={NOW} format="clock" />}
              />
              <Card.Body>
                You declined in your wallet. The swap of 250 WXDAI is held.
              </Card.Body>
              <Card.Footer>
                <Button variant="neutral" size="sm">
                  Cancel
                </Button>
                <Button variant="primary" size="sm">
                  Resume
                </Button>
              </Card.Footer>
            </Card>
          </div>
        </Example>
        <Example label="tone danger, tone unverified">
          <div className="flex w-full flex-col gap-4">
            <Card tone="danger" aria-label="Run, failed">
              <Card.Header
                title="Run"
                status={<Badge tone="danger">failed</Badge>}
                time={<Time at={NOW - 7_200_000} now={NOW} format="clock" />}
              />
              <Card.Body>The router reverted: insufficient output.</Card.Body>
            </Card>
            <Card tone="unverified" aria-label="Run, from an export">
              <Card.Header
                title="Run"
                status={<Badge tone="unverified">from an export</Badge>}
                time={<Time at={NOW - 86_400_000} now={NOW} format="clock" />}
              />
            </Card>
          </div>
        </Example>
        <Example label="well: code, logs">
          <div className="flex w-full flex-col gap-2">
            <Well>{CODE}</Well>
            <Well size="sm">{LOGS}</Well>
          </div>
        </Example>
      </Both>
    </Section>
  );
}
