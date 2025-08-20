// Jest setup file
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Increase timeout for image processing tests
jest.setTimeout(30000);
