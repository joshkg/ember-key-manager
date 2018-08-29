import EmberObject, {
  get,
  setProperties
} from '@ember/object';
import { assign } from '@ember/polyfills';
import { copy } from '@ember/object/internals';

const defaultAttrs = {
  callback: null,
  element: typeof document !== 'undefined' ? document.body : null,
  executionKey: '',
  isDisabledOnInput: false,
  modifierKeys: [],
  priority: 0,
  keyEvent: null,
  groupName: null,
  isDisabled: false
}

export default EmberObject.extend({
  setup(customAttrs) {
    const defaultAttrsCopy = copy(defaultAttrs);
    const attrs = assign(defaultAttrsCopy, customAttrs);

    setProperties(this, attrs);
  },
});
