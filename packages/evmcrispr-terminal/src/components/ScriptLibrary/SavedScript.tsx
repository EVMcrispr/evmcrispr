import {
  Box,
  Heading,
  Icon,
  IconButton,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { TrashIcon } from '@heroicons/react/24/solid';

import type { StoredScript } from '../../types';

function getDate(date: Date) {
  const parsedDate = new Date(date);

  return {
    month: parsedDate
      .toLocaleString('default', { month: 'short' })
      .split('.')[0],
    day: parsedDate.getUTCDate(),
    year: parsedDate.getUTCFullYear(),
  };
}

type SavedScriptProps = {
  script: StoredScript;
  onItemClick(title: string): void;
  onItemRemove(title: string): void;
};

export function SavedScript({
  script,
  onItemRemove,
  onItemClick,
}: SavedScriptProps) {
  const { date, title } = script;
  const { day, month, year } = getDate(date);

  return (
    <Box
      cursor={'pointer'}
      bgColor={'gray.800'}
      p={5}
      position={'relative'}
      w={'full'}
      onClick={() => onItemClick(title)}
    >
      <VStack spacing={3} align={'flex-start'}>
        <Heading fontSize={'2xl'} color={'yellow.300'}>
          {title}
        </Heading>
        <Text color={'white'} fontSize={''}>
          Created <span style={{ textTransform: 'capitalize' }}>{month} </span>
          {day}, {year}
        </Text>
      </VStack>
      <Tooltip label="Remove saved script" variant={'warning'}>
        <IconButton
          aria-label="Remove saved script"
          icon={<Icon as={TrashIcon} />}
          variant={'outline'}
          colorScheme={'pink'}
          position={'absolute'}
          right={'10px'}
          bottom={'10px'}
          size={'xs'}
          onClick={(e) => {
            e.stopPropagation();
            onItemRemove(title);
          }}
        />
      </Tooltip>
    </Box>
  );
}
