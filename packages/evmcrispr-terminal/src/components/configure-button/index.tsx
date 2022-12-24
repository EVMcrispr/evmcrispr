import {
  Box,
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Text,
  Tooltip,
} from '@chakra-ui/react';
import { Cog8ToothIcon } from '@heroicons/react/24/solid';

export default function ConfigureButton({
  maximizeGasLimit,
  setMaximizeGasLimit,
}: {
  maximizeGasLimit: boolean;
  setMaximizeGasLimit: Record<string, () => void>;
}) {
  return (
    <Popover placement={'bottom-end'}>
      <Tooltip label="Script configuration" placement="top">
        <Box>
          <PopoverTrigger>
            <IconButton
              icon={<Icon as={Cog8ToothIcon} />}
              aria-label={'Script configuration'}
              variant={'outline'}
              size={'md'}
            />
          </PopoverTrigger>
        </Box>
      </Tooltip>
      <PopoverContent
        bg={'gray.700'}
        borderRadius={'none'}
        border={'2px solid'}
        borderColor={'green.300'}
        minWidth={'300px'}
        height="100px"
      >
        <PopoverBody color={'white'}>
          <Text fontSize={'xl'} color={'green.300'}>
            Script Configuration
          </Text>
          <HStack>
            <FormLabel
              htmlFor="maximize-gas-limit"
              fontSize={'xl'}
              lineHeight={'base'}
            >
              Maximize gas limit?
            </FormLabel>
            <Switch
              id="maximize-gas-limit"
              size="md"
              checked={maximizeGasLimit}
              onChange={setMaximizeGasLimit.toggle}
            />
          </HStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
