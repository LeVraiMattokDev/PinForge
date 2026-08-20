/**
 * @pinforge/schema is the contract every other package agrees on: the project
 * format, its validation and its migrations. It depends on nothing inside
 * PinForge, and everything else depends on it.
 */

export * from './common.js';
export * from './variables.js';
export * from './assets.js';
export * from './tilesets.js';
export * from './components.js';
export * from './entities.js';
export * from './events/refs.js';
export * from './events/triggers.js';
export * from './events/conditions.js';
export * from './events/actions.js';
export * from './events/rules.js';
export * from './events/catalog.js';
export * from './scenes.js';
export * from './project.js';
