import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Button,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useBoolean,
} from "@chakra-ui/react";

export function ExecuteButton({
  isLoading,
  onExecute,
}: {
  isLoading: boolean;
  onExecute: (inBatch: boolean) => void;
}) {
  const [isBatch, setIsBatch] = useBoolean(false);

  return (
    <HStack spacing={0}>
      <Button
        variant="overlay"
        colorScheme={"green"}
        onClick={() => onExecute(isBatch)}
        isLoading={isLoading}
        loadingText={"Executing"}
        size={"md"}
        borderRightRadius={0}
      >
        {isBatch ? "Execute in batch" : "Execute one by one"}
      </Button>
      {!isLoading && (
        <Menu>
          <MenuButton
            as={IconButton}
            icon={<ChevronDownIcon />}
            variant="overlay"
            colorScheme={"green"}
            size={"md"}
            borderLeftRadius={0}
            borderLeft="1px solid"
            borderLeftColor="green.300"
          />
          <MenuList>
            <MenuItem onClick={setIsBatch.toggle}>
              {isBatch ? "Execute one by one" : "Execute in batch"}
            </MenuItem>
          </MenuList>
        </Menu>
      )}
    </HStack>
  );
}
