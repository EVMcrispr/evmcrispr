import { Alert, AlertDescription, AlertIcon } from "@chakra-ui/react";

export default function Toast({ status, description }: any) {
  return (
    <Alert variant="solid" status={status}>
      <AlertIcon />
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
