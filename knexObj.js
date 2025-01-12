import knexEnvOptions from './knexoptions.js';
import Knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();
const knexEnv = knexEnvOptions[process.env.NODE_ENV];

const getKnexObj = () => {
  return Knex(knexEnv);
}

export default getKnexObj;
