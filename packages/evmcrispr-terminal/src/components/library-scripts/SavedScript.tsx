import { Box, Icon, IconButton, Text, VStack } from '@chakra-ui/react';
import { TrashIcon } from '@heroicons/react/24/solid';
import { useNavigate, useParams } from 'react-router';

import type { Script } from '../../types';

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
  script: Script;
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>;
  onItemClick(hashId: string): void;
};

export function SavedScript({
  script,
  setScripts,
  onItemClick,
}: SavedScriptProps) {
  const { date, hashId, title } = script;
  const navigate = useNavigate();
  const params = useParams();
  const { day, month, year } = getDate(date);

  function handleRemoveScript() {
    const savedScripts = localStorage.getItem('savedScripts');
    if (!savedScripts) return;

    const filteredScripts = JSON.parse(savedScripts).filter(
      (s: Script) => s.hashId !== hashId,
    );
    setScripts(filteredScripts);
    localStorage.setItem('savedScripts', JSON.stringify(filteredScripts));

    return params?.hashId === hashId
      ? navigate('/terminal', { replace: true })
      : navigate(`/terminal/${params?.hashId}`, { replace: true });
  }

  return (
    <Box
      cursor={'pointer'}
      bgColor={'brand.gray.800'}
      p={5}
      position={'relative'}
      w={'full'}
      onClick={() => onItemClick(hashId)}
    >
      <VStack spacing={3} align={'flex-start'}>
        <Text fontSize={'2xl'} color={'brand.yellow.300'}>
          {title}
        </Text>
        <Text color={'white'} fontSize={''}>
          Created <span style={{ textTransform: 'capitalize' }}>{month} </span>
          {day}, {year}
        </Text>
      </VStack>
      <IconButton
        aria-label="Remove saved script"
        icon={<Icon as={TrashIcon} />}
        variant={'outline'}
        position={'absolute'}
        right={'10px'}
        bottom={'10px'}
        size={'xs'}
        onClick={handleRemoveScript}
      />
    </Box>
  );
}
