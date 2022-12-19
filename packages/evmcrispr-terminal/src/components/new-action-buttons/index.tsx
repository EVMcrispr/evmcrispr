import { HStack, Icon, IconButton } from '@chakra-ui/react';
import { Cog8ToothIcon, ShareIcon } from '@heroicons/react/24/solid';

import SaveIcon from './SaveIcon';

export default function NewActionButtons() {
  return (
    <HStack spacing={1}>
      <IconButton
        icon={<Icon as={SaveIcon} />}
        aria-label={'Save terminal content'}
        variant={'outline'}
      />
      <IconButton
        icon={<Icon as={ShareIcon} />}
        aria-label={'Share link'}
        variant={'outline'}
      />
      <IconButton
        icon={<Icon as={Cog8ToothIcon} />}
        aria-label={'Configure gas limit'}
        variant={'outline'}
      />
    </HStack>
  );
}
