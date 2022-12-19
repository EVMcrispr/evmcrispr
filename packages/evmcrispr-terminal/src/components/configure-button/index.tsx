import {
  FormLabel,
  HStack,
  Icon,
  IconButton,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Switch,
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
      <PopoverTrigger>
        <IconButton
          icon={<Icon as={Cog8ToothIcon} />}
          aria-label={'Configure options'}
          variant={'outline'}
        />
      </PopoverTrigger>
      <PopoverContent
        bg={'brand.dark'}
        borderRadius={'none'}
        border={'2px solid'}
        borderColor={'brand.green.300'}
      >
        <PopoverBody color={'white'}>
          <HStack>
            <FormLabel
              htmlFor="maximize-gas-limit"
              fontSize={'2xl'}
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
