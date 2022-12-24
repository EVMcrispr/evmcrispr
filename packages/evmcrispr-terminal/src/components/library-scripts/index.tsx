import React, { useState } from 'react';
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Show,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { Search2Icon } from '@chakra-ui/icons';
import { FolderIcon, FolderOpenIcon } from '@heroicons/react/24/solid';

import { useNavigate } from 'react-router';

import { SavedScript } from './SavedScript';
import { LibraryButton } from './LibraryButton';
import type { Script } from '../../types';

function getInitialScripts() {
  const savedScripts = localStorage.getItem('savedScripts');
  if (!savedScripts) return [];
  return JSON.parse(savedScripts);
}

export default function LibraryScripts() {
  const [scripts, setScripts] = useState<Script[]>(getInitialScripts());
  const [filteredScripts, setFilteredScripts] = useState<Script[]>(scripts);
  const { isOpen, onClose, onToggle } = useDisclosure({
    id: 'library',
  });
  const navigate = useNavigate();

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const filterScripts = scripts.filter(({ title }) =>
      title.includes(e.target.value),
    );
    return setFilteredScripts(filterScripts);
  }

  const handleItemClick = (hashId: string) => {
    onToggle();
    navigate(`/terminal/${hashId}`);
  };

  return (
    <>
      <Box position={'relative'}>
        {!isOpen ? (
          <LibraryButton
            right={0}
            icon={FolderIcon}
            onClick={() => {
              const initialScripts = getInitialScripts();
              setScripts(initialScripts);
              setFilteredScripts(initialScripts);
              onToggle();
            }}
          />
        ) : null}
        <Drawer
          isOpen={isOpen}
          placement="right"
          onClose={onClose}
          size={['full', 'sm']}
        >
          <DrawerContent
            bgColor={'brand.gray.700'}
            borderLeft={'2px solid'}
            borderColor={'brand.green.300'}
          >
            <Show above="sm">
              <LibraryButton onClick={onToggle} icon={FolderOpenIcon} />
            </Show>
            <DrawerCloseButton color={'white'} />
            <DrawerHeader py={6}>
              <VStack spacing={4}>
                <HStack justify={'center'} align={'center'} spacing={4}>
                  <Text color={'white'} fontSize={'4xl'}>
                    Library
                  </Text>
                </HStack>
                <InputGroup>
                  <Input
                    border={'1px solid'}
                    borderColor={'brand.green.300'}
                    placeholder={'Search'}
                    color={'white'}
                    p={2.5}
                    borderRadius={'none'}
                    fontSize={'2xl'}
                    _placeholder={{
                      color: 'white',
                    }}
                    onChange={handleInputChange}
                  />
                  <InputRightElement>
                    <IconButton
                      icon={<Search2Icon />}
                      aria-label={'Search scripts'}
                      size={'sm'}
                      variant={'solid'}
                      colorScheme={'green'}
                    />
                  </InputRightElement>
                </InputGroup>
              </VStack>
            </DrawerHeader>

            <DrawerBody px={2}>
              <VStack spacing={2}>
                {filteredScripts.length > 0 ? (
                  filteredScripts.map((s) => (
                    <SavedScript
                      script={s}
                      onItemClick={handleItemClick}
                      setScripts={(e: any) => {
                        setScripts(e);
                        setFilteredScripts(e);
                      }}
                      key={s.hashId}
                    />
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
      </Box>
    </>
  );
}
