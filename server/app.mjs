import express from 'express';
import {createApi} from './api.mjs';
export function createApp(options){return createApi({...options,framework:express});}
