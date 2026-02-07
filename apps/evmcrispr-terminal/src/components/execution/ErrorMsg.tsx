import { Alert, Button } from "@repo/ui";

import { AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const COLLAPSE_THRESHOLD = 30;

export default function ErrorMsg({ errors }: { errors: string[] }) {
  const [showCollapse, setShowCollapse] = useState<boolean>(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!errors?.length) {
      setShowExpandBtn(false);
    } else if (contentRef.current) {
      setShowExpandBtn(contentRef.current.clientHeight > COLLAPSE_THRESHOLD);
    }
  }, [errors]);

  return (
    <div className="flex flex-col justify-start max-w-full break-all">
      {errors.map((e, index) => (
        <Alert key={index} status="error">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-white" />
            <Alert.Description>
              <div
                ref={contentRef}
                className={showCollapse ? "" : "overflow-hidden"}
                style={
                  showCollapse
                    ? undefined
                    : { maxHeight: `${COLLAPSE_THRESHOLD}px` }
                }
              >
                {e}
              </div>
            </Alert.Description>
          </div>
        </Alert>
      ))}
      {showExpandBtn && (
        <Button
          className="self-end mt-4"
          size="sm"
          variant="default"
          onClick={() => setShowCollapse((show) => !show)}
        >
          Show {showCollapse ? "Less" : "More"}
        </Button>
      )}
    </div>
  );
}
