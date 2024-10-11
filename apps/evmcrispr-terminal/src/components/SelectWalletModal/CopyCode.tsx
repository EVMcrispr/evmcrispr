import { Button, Flex, useClipboard } from "@chakra-ui/react";

export default function CopyCode({ code }: { code: string }) {
  const { onCopy, hasCopied } = useClipboard(code);

  return (
    <Flex mb={2}>
      <Button
        colorScheme="green"
        variant="outline-overlay"
        size="sm"
        onClick={onCopy}
      >
        {hasCopied ? "Copied!" : "Copy"}
      </Button>
    </Flex>
  );
}
