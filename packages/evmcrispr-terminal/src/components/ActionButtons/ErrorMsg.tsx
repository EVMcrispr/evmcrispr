import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Collapse,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

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
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="left"
      maxWidth="100%"
      wordBreak="break-all"
    >
      {errors.map((e, index) => (
        <Alert key={index} status="error">
          <Box display="flex" alignItems="flex-start">
            <AlertIcon />
            <AlertDescription>
              <Collapse startingHeight={COLLAPSE_THRESHOLD} in={showCollapse}>
                <div ref={contentRef}>{e}</div>
              </Collapse>
            </AlertDescription>
          </Box>
        </Alert>
      ))}
      {showExpandBtn && (
        <Button
          width="30"
          alignSelf="flex-end"
          size="sm"
          onClick={() => setShowCollapse((show) => !show)}
          mt="1rem"
        >
          Show {showCollapse ? 'Less' : 'More'}
        </Button>
      )}
    </Box>
  );
}
