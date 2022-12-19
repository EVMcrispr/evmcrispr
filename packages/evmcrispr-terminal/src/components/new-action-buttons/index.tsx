import { HStack, Icon, IconButton } from '@chakra-ui/react';
import { Cog8ToothIcon } from '@heroicons/react/24/solid';

import ShareButton from '../share-button';
import SaveIcon from './SaveIcon';

export default function NewActionButtons({
  script,
  savedScript,
}: {
  script: string;
  savedScript?: string;
}) {
  return (
    <HStack spacing={1}>
      <IconButton
        icon={<Icon as={SaveIcon} />}
        aria-label={'Save terminal content'}
        variant={'outline'}
      />
      <ShareButton script={script} savedScript={savedScript} />
      <IconButton
        icon={<Icon as={Cog8ToothIcon} />}
        aria-label={'Configure gas limit'}
        variant={'outline'}
      />
    </HStack>
  );
}
