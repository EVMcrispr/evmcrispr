/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Buffer } from 'buffer';
import EventEmitter from 'events';
import process from 'process';

const _window = window as typeof window & {
  EventEmitter: typeof EventEmitter;
};

_window.process = process;
// @ts-ignore
_window.Buffer = Buffer;
_window.EventEmitter = EventEmitter;
// @ts-ignore
_window.global = globalThis;
