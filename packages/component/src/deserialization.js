import {deserialize as simpleDeserialize} from 'simple-serialization';
import {possiblyAsync} from 'possibly-async';
import ow from 'ow';

import {createComponentMap, getComponentFromComponentMap} from './utilities';

export function deserialize(value, options = {}) {
  ow(
    options,
    'options',
    ow.object.partialShape({
      objectHandler: ow.optional.function,
      functionHandler: ow.optional.function,
      knownComponents: ow.optional.array,
      attributeFilter: ow.optional.function,
      deserializeFunctions: ow.optional.boolean
    })
  );

  const {
    objectHandler: originalObjectHandler,
    functionHandler: originalFunctionHandler,
    knownComponents,
    attributeFilter,
    deserializeFunctions = false
  } = options;

  const knownComponentMap = createComponentMap(knownComponents);

  const objectHandler = function(object) {
    if (originalObjectHandler !== undefined) {
      const deserializedObject = originalObjectHandler(object);

      if (deserializedObject !== undefined) {
        return deserializedObject;
      }
    }

    const {__Component, __component, __new, ...attributes} = object;

    let componentName;
    let isComponentClass;

    if (__Component !== undefined) {
      // The value is a serialized component class
      componentName = __Component;
      isComponentClass = true;
    } else if (__component !== undefined) {
      componentName = __component;
      isComponentClass = false;
    }

    if (!componentName) {
      return undefined;
    }

    const Component = getComponentFromComponentMap(knownComponentMap, componentName);

    let deserializedComponent;

    if (isComponentClass) {
      deserializedComponent = Component;
    } else {
      deserializedComponent = __new === true ? new Component() : Component.instantiate();
    }

    return possiblyAsync.forEach(
      Object.entries(attributes),
      ([attributeName, attributeValue]) => {
        const attribute = deserializedComponent.getAttribute(attributeName, {
          throwIfMissing: false
        });

        if (attribute === undefined) {
          return;
        }

        return possiblyAsync(
          attributeFilter !== undefined
            ? attributeFilter.call(deserializedComponent, attribute)
            : true,
          {
            then: isNotFilteredOut => {
              if (isNotFilteredOut) {
                return possiblyAsync(simpleDeserialize(attributeValue, options), {
                  then: deserializedAttributeValue => {
                    attribute.setValue(deserializedAttributeValue);
                  }
                });
              }
            }
          }
        );
      },
      {then: () => deserializedComponent}
    );
  };

  let functionHandler;

  if (deserializeFunctions) {
    functionHandler = function(object) {
      if (originalFunctionHandler !== undefined) {
        const deserializedFunction = originalFunctionHandler(object);

        if (deserializedFunction !== undefined) {
          return deserializedFunction;
        }
      }

      const {__function, ...serializedAttributes} = object;

      if (__function === undefined) {
        return undefined;
      }

      const functionCode = __function;

      return possiblyAsync.mapValues(
        serializedAttributes,
        attributeValue => simpleDeserialize(attributeValue, options),
        {
          then: deserializedAttributes => {
            const {__context: context} = deserializedAttributes;
            const deserializedFunction = deserializeFunction(functionCode, context);
            Object.assign(deserializedFunction, deserializedAttributes);
            return deserializedFunction;
          }
        }
      );
    };
  }

  options = {...options, objectHandler, functionHandler};

  return simpleDeserialize(value, options);
}

export function deserializeFunction(functionCode, context) {
  let evalCode = `(${functionCode});`;

  if (context !== undefined) {
    const contextKeys = Object.keys(context).join(', ');
    const contextCode = `const {${contextKeys}} = context;`;
    evalCode = `${contextCode} ${evalCode}`;
  }

  // eslint-disable-next-line no-eval
  return eval(evalCode);
}