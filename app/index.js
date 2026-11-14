import { registerRootComponent } from 'expo';

// Must load before the app: Android may start the background location task
// on its own, so the task has to be defined as soon as the code runs.
import './src/backgroundLocation';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
