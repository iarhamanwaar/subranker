import { aot } from './aot.js';
import { demonSlayer } from './demonslayer.js';
import { jjk } from './jjk.js';
import { mcu } from './mcu.js';
import { mcuChrono } from './mcuchrono.js';
import { onePiece } from './onepiece.js';
import { starWars } from './starwars.js';
import { xmen } from './xmen.js';
import type { Franchise } from '../types.js';

/** Order here is the order of the cards in the Home row. */
export const FRANCHISES: Franchise[] = [mcu, mcuChrono, xmen, starWars, demonSlayer, jjk, aot, onePiece];
