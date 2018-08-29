import Service from '@ember/service';
import { getOwner } from '@ember/application';
import { assign } from '@ember/polyfills';
import Macro from '../utils/macro';
import { TO_MODIFIER, TO_KEY } from '../utils/modifier-keys';
import {
  get,
  getProperties,
  set,
  setProperties,
} from '@ember/object';
import {
  filterBy,
} from '@ember/object/computed';
import { warn } from '@ember/debug';
import { isPresent, } from '@ember/utils';
import {
  MODIFIERS_ON_KEYUP as MODIFIERS_ON_KEYUP_WARNING,
} from 'ember-key-manager/utils/warning-messages';
import { inject as injectService } from '@ember/service';

const inputElements = [
  'INPUT',
  'SELECT',
  'TEXTAREA',
];

const isInputElement = (element) => {
  const isContentEditable = element.isContentEditable;
  const isInput = inputElements.includes(element.tagName);

  return isContentEditable || isInput;
};

export default Service.extend({
  fastboot: injectService(),
  isDisabledOnInput: false, // Config option

  keydownMacros: filterBy('macros', 'keyEvent', 'keydown'),
  keyupMacros: filterBy('macros', 'keyEvent', 'keyup'),
  clickMacros: filterBy('macros', 'keyEvent', 'click'),

  init() {
    this.macros = [];
    this._registerConfigOptions();
  },

  addMacro(options) {
    // guard against trying to attach event listeners in fastboot
    if (get(this, 'fastboot.isFastBoot')) {
      return;
    }
    const macroAttrs = this._mergeConfigDefaults(options);
    const macro = Macro.create();
    macro.setup(macroAttrs);

    const keyEvent = get(macro, 'keyEvent');
    this._handleModifiersOnKeyup(macro, keyEvent);
    const element = get(macro, 'element');
    this._addEventListener(element, keyEvent);

    const macros = get(this, 'macros');
    macros.pushObject(macro);

    return macro;
  },

  _handleModifiersOnKeyup({ modifierKeys }, keyEvent) {
    if (keyEvent === 'keyup' && isPresent(modifierKeys)) {
      warn(MODIFIERS_ON_KEYUP_WARNING, false, {id: 'keyup-with-modifiers'});
    }
  },

  _mergeConfigDefaults(attrs) {
    const isDisabledOnInput = get(this, 'isDisabledOnInput');
    return assign({ isDisabledOnInput }, attrs);
  },

  _addEventListener(element, keyEvent) {
    const hasListenerForElementAndKeyEvent = this._findMacroWithElementAndKeyEvent(element, keyEvent);
    if (!hasListenerForElementAndKeyEvent) {
      element.addEventListener(keyEvent, this);
    }
  },

  removeMacro(macro) {
    const element = get(macro, 'element');
    const keyEvent = get(macro, 'keyEvent');
    const macros = get(this, 'macros');

    macros.removeObject(macro);

    this._removeEventListenter(element, keyEvent);
  },

  _removeEventListenter(element, keyEvent) {
    const hasListenerForElementAndKeyEvent = this._findMacroWithElementAndKeyEvent(element, keyEvent);
    if (!hasListenerForElementAndKeyEvent) {
      element.removeEventListener(keyEvent, this);
    }
  },

  disable(recipient) {
    this._setDisabledState(recipient, true);
  },

  enable(recipient) {
    this._setDisabledState(recipient, false);
  },

  handleEvent(event) {
    if (get(this, 'isDestroyed') || get(this, 'isDestroying')) {
      return false;
    }

    const isKeydown = event.type === 'keydown';
    const isKeyup = event.type === 'keyup';
    const isClick = event.type === 'click';

    if (isKeydown || isKeyup || isClick) {
      const allEventModifierKeys = {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      }
      const eventModifierKeys = Object.keys(allEventModifierKeys)
        .filter((key) => {
          return allEventModifierKeys[key] !== false;
        });
      const eventKey = isClick ? 'click' : event.key;
      const matchingMacros = this._findMatchingMacros(
        event.target,
        eventKey,
        eventModifierKeys,
        event.type
      );

      if (matchingMacros) {
        const isTargetInput = isInputElement(event.target);
        !isClick && event.stopPropagation();

        matchingMacros.forEach((matchingMacro) => {
          let ignore = false;
          if (matchingMacro.ignore) {
            matchingMacro.ignore.forEach((selectorId) => {
              let ignoreElement = document.getElementById(selectorId);
              let isRemoved = !event.target || !this.documentOrBodyContains(event.target);
              let isInside = ignoreElement && (ignoreElement === event.target ||  ignoreElement.contains(event.target));
              if (isRemoved || isInside) {
                ignore = true;
              }
            });
          }
          const isDisabled = get(matchingMacro, 'isDisabled') ||
            (get(matchingMacro, 'isDisabledOnInput') && isTargetInput);

          if (!isDisabled && !ignore) {
            get(matchingMacro, 'callback')(event);
          }
        });
      }
    }
  },

  _findMacroWithElementAndKeyEvent(eventElement, eventKeyEvent) {
    return get(this, `${eventKeyEvent}Macros`).find((macro) => {
      const element = get(macro, 'element');
      return eventElement === element;
    });
  },

  _findMatchingMacros(eventElement, eventExecutionKey, eventModifierKeys, eventKeyEvent) {
    const matchingMacros = get(this, `${eventKeyEvent}Macros`).filter((macro) => {
      const {
        element,
        executionKey,
        modifierKeys,
      } = getProperties(macro, ['element', 'executionKey', 'modifierKeys']);
      const hasElementMatch = element === eventElement || element.contains(eventElement);
      const hasExecutionKeyMatch = eventExecutionKey.toLowerCase() === executionKey.toLowerCase();
      const hasModifierKeysMatch = eventModifierKeys.removeObject(TO_MODIFIER[eventExecutionKey])
        .every((key) => {
          return modifierKeys.toArray().map(k => k.capitalize()).includes(TO_KEY[key]);
        });
      const hasModifierKeyCount = eventModifierKeys.length === modifierKeys.length;

      return hasElementMatch &&
        hasExecutionKeyMatch &&
        hasModifierKeysMatch &&
        hasModifierKeyCount;
    });

    const highestPriority = matchingMacros.mapBy('priority')
      .reduce((max, priority) => Math.max(max, priority), -Infinity);

    return matchingMacros.filter((macro) => get(macro, 'priority') === highestPriority);
  },

  _registerConfigOptions() {
    const config = getOwner(this).lookup('main:key-manager-config');

    if (config) {
      setProperties(this, config);
    }
  },

  _setDisabledState(recipient, isDisabled) {
    if (typeof recipient === 'string') {
      this._setGroupDisabledState(recipient, isDisabled);
    } else {
      set(recipient, 'isDisabled', isDisabled);
    }
  },

  _setGroupDisabledState(groupName, isDisabled) {
    get(this, 'macros').filterBy('groupName', groupName)
      .setEach('isDisabled', isDisabled);
  },
  documentOrBodyContains(element) {
    if (typeof document.contains === 'function') {
      return document.contains(element);
    } else {
      document.body.contains(element);
    }
  }  
});
