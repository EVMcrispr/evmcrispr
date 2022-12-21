import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  HStack,
  Icon,
  IconButton,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { StarIcon, TrashIcon } from '@heroicons/react/24/solid';
import { Link } from 'react-router-dom';

type Script = {
  title: string;
  date: Date;
  hashId: string;
};

function SavedScript({
  title,
  date,
  hashId,
  setScripts,
}: Script & { setScripts: React.Dispatch<React.SetStateAction<Script[]>> }) {
  const parsedDate = new Date(date);
  const month = parsedDate
    .toLocaleString('default', { month: 'short' })
    .split('.')[0];
  const day = parsedDate.getUTCDate();
  const year = parsedDate.getUTCFullYear();

  function handleRemoveScript() {
    const savedScripts = localStorage.getItem('savedScripts');

    if (!savedScripts) return;

    const parsedScripts = JSON.parse(savedScripts);
    const filteredScripts = parsedScripts.filter(
      (s: Script) => s.hashId !== hashId,
    );
    setScripts(filteredScripts);
    localStorage.setItem('savedScripts', JSON.stringify(filteredScripts));
  }

  return (
    <Box bgColor={'brand.gray.800'} p={5} position={'relative'} w={'full'}>
      <Link to={`/terminal/${hashId}`}>
        <VStack spacing={3} align={'flex-start'}>
          <Text fontSize={'3xl'} color={'brand.yellow.300'}>
            {title}
          </Text>
          <Text color={'white'} fontSize={'md'}>
            Created{' '}
            <span style={{ textTransform: 'capitalize' }}>{month} </span>
            {day}, {year}
          </Text>
        </VStack>
      </Link>
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

function getInitialScripts() {
  const savedScripts = localStorage.getItem('savedScripts');
  if (!savedScripts) return [];
  return JSON.parse(savedScripts);
}

export default function LibraryScripts() {
  const [scripts, setScripts] = useState<Script[]>(getInitialScripts());
  const btnRef = useRef(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Box
        position={'relative'}
        zIndex={1000}
        transition={isOpen ? 'transform 450ms ease' : ''}
        transform={`${
          isOpen
            ? 'translateX(calc(100vw - calc(320px + 154px)))'
            : 'translateX(calc(100vw - 154px))'
        }`}
      >
        <Button
          variant={'outline'}
          colorScheme={'yellow'}
          rightIcon={
            <Icon as={StarIcon} boxSize={6} color={'brand.yellow.300'} />
          }
          size={'md'}
          color={'white'}
          ref={btnRef}
          onClick={onOpen}
        >
          Library
        </Button>
      </Box>
      <Drawer
        isOpen={isOpen}
        placement="right"
        onClose={onClose}
        finalFocusRef={btnRef}
      >
        <DrawerContent bgColor={'brand.gray.700'}>
          <DrawerHeader>
            <HStack justify={'center'} align={'center'} spacing={4}>
              <Text color={'white'} fontSize={'4xl'}>
                My Library
              </Text>
              <Icon as={StarIcon} color={'brand.yellow.300'} boxSize={10} />
            </HStack>
          </DrawerHeader>

          <DrawerBody px={2}>
            <VStack spacing={2}>
              {scripts.length > 0 ? (
                scripts.map((s) => (
                  <SavedScript {...s} setScripts={setScripts} key={s.hashId} />
                ))
              ) : (
                <Text fontSize={'2xl'} color={'brand.yellow.300'}>
                  No scripts saved yet.
                </Text>
              )}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
