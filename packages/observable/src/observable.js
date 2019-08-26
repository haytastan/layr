export const Observable = (Base = Object) =>
  class Observable extends Base {
    observe(observer) {
      this._getObservers().add(observer);
    }

    unobserve(observer) {
      this._getObservers().remove(observer);
    }

    notify() {
      this._getObservers().call();
    }

    _getObservers() {
      if (!Object.prototype.hasOwnProperty.call(this, '_observers')) {
        Object.defineProperty(this, '_observers', {value: new ObserverSet()});
      }
      return this._observers;
    }
  };

export function createObservable(target) {
  if (!canBecomeObservable(target)) {
    throw new Error(`Observable target must be an object or an array`);
  }

  if (isObservable(target)) {
    return target;
  }

  if ('observe' in target || 'unobserve' in target || 'notify' in target) {
    throw new Error(
      `Observable target cannot own or inherit a property named 'observe', 'unobserve' or 'notify'`
    );
  }

  const observers = new ObserverSet();

  const addObserver = function (observer) {
    observers.add(observer);
  };

  const removeObserver = function (observer) {
    observers.remove(observer);
  };

  const callObservers = function () {
    observers.call();
  };

  const handler = {
    has(target, key) {
      if (key === 'observe' || key === 'unobserve' || key === 'notify') {
        return true;
      }

      return Reflect.has(target, key);
    },

    get(target, key) {
      if (key === 'observe') {
        return addObserver;
      }

      if (key === 'unobserve') {
        return removeObserver;
      }

      if (key === 'notify') {
        return callObservers;
      }

      return Reflect.get(target, key);
    },

    set(target, key, nextValue) {
      if (key === 'observe' || key === 'unobserve' || key === 'notify') {
        throw new Error(
          `Cannot set a property named 'observe', 'unobserve' or 'notify' in an observed object`
        );
      }

      const previousValue = Reflect.get(target, key);

      const result = Reflect.set(target, key, nextValue);

      if (nextValue !== previousValue) {
        if (isObservable(previousValue)) {
          previousValue.unobserve(callObservers);
        }
        if (isObservable(nextValue)) {
          nextValue.observe(callObservers);
        }
        callObservers();
      }

      return result;
    },

    deleteProperty(target, key) {
      if (key === 'observe' || key === 'unobserve' || key === 'notify') {
        throw new Error(
          `Cannot delete a property named 'observe', 'unobserve' or 'notify' in an observed object`
        );
      }

      const previousValue = Reflect.get(target, key);
      if (isObservable(previousValue)) {
        previousValue.unobserve(callObservers);
      }

      const result = Reflect.deleteProperty(target, key);
      callObservers();
      return result;
    }
  };

  return new Proxy(target, handler);
}

class ObserverSet {
  constructor() {
    this._observers = [];
  }

  add(observer) {
    if (typeof observer !== 'function') {
      throw new Error(`'observer' must be a function`);
    }

    this._observers.push(observer);
  }

  remove(observer) {
    if (typeof observer !== 'function') {
      throw new Error(`'observer' must be a function`);
    }

    const index = this._observers.indexOf(observer);
    if (index !== -1) {
      this._observers.splice(index, 1);
    }
  }

  call() {
    for (const observer of this._observers) {
      observer();
    }
  }
}

export function isObservable(object) {
  return (
    typeof object === 'object' &&
    object !== null &&
    typeof object.observe === 'function' &&
    typeof object.unobserve === 'function' &&
    typeof object.notify === 'function'
  );
}

export function canBecomeObservable(target) {
  return typeof target === 'object' && target !== null && !(target instanceof Date);
}