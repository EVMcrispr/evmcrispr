import { useState } from 'react';
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  HStack,
  Heading,
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
import type { StoredScript } from '../../types';
import { removeScriptFromLocalStorage, slug } from '../../utils';

function getScriptList() {
  const savedScripts = localStorage.getItem('savedScripts');
  if (!savedScripts) return [];
  return Object.values(JSON.parse(savedScripts)).reverse() as StoredScript[];
}

export default function LibraryScripts() {
  const [scripts, setScripts] = useState<StoredScript[]>(getScriptList());
  const [filteredScripts, setFilteredScripts] =
    useState<StoredScript[]>(scripts);
  const { isOpen, onClose, onToggle } = useDisclosure({
    id: 'library',
  });
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function filterScripts(scripts: StoredScript[], query: string): void {
    const filteredScripts = scripts.filter(({ title }) =>
      slug(title).includes(slug(query)),
    );
    setQuery(query);
    setFilteredScripts(filteredScripts);
  }

  const handleItemClick = (title: string) => {
    onToggle();
    navigate(`/terminal/${slug(title)}`);
  };

  const handleItemRemove = (title: string) => {
    removeScriptFromLocalStorage(title);
    const initialScripts = getScriptList();
    setScripts(initialScripts);
    filterScripts(initialScripts, query);
  };

  return (
    <>
      <Box position={'relative'}>
        {!isOpen ? (
          <LibraryButton
            right={0}
            icon={FolderIcon}
            onClick={() => {
              const initialScripts = getScriptList();
              setScripts(initialScripts);
              filterScripts(initialScripts, query);
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
            bgColor={'gray.900'}
            borderLeft={'2px solid'}
            borderColor={'green.300'}
          >
            <Show above="sm">
              <LibraryButton onClick={onToggle} icon={FolderOpenIcon} />
            </Show>
            <DrawerCloseButton color={'white'} />
            <DrawerHeader py={6}>
              <VStack spacing={4}>
                <HStack justify={'center'} align={'center'} spacing={4}>
                  <Heading color={'white'} fontSize={'4xl'}>
                    Library
                  </Heading>
                </HStack>
                <InputGroup>
                  <Input
                    border={'1px solid'}
                    borderColor={'green.300'}
                    placeholder={'Search'}
                    color={'white'}
                    p={2.5}
                    borderRadius={'none'}
                    fontSize={'2xl'}
                    _placeholder={{
                      color: 'white',
                      opacity: 1,
                    }}
                    _hover={{
                      borderColor: 'green.300',
                    }}
                    _focusVisible={{
                      borderColor: 'green.300',
                      boxShadow: 'none',
                    }}
                    value={query}
                    onChange={(e) => filterScripts(scripts, e.target.value)}
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
                      onItemRemove={handleItemRemove}
                      key={s.title}
                    />
                  ))
                ) : (
                  <Text fontSize={'2xl'} color={'yellow.300'}>
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
