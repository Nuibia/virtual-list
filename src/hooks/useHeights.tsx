import * as React from 'react';
import { useRef, useEffect } from 'react';
import findDOMNode from 'rc-util/lib/Dom/findDOMNode';
import raf from 'rc-util/lib/raf';
import type { GetKey } from '../interface';
import CacheMap from '../utils/CacheMap';

export default function useHeights<T>(
  getKey: GetKey<T>,
  onItemAdd?: (item: T) => void,
  onItemRemove?: (item: T) => void,
): [(item: T, instance: HTMLElement) => void, () => void, CacheMap, number] {
  //是否更新
  const [updatedMark, setUpdatedMark] = React.useState(0);
  // 一个存储了当前所有可视区域的dom的map，
  const instanceRef = useRef(new Map<React.Key, HTMLElement>());
  // value是每一个dom的高，key是每一个dom的key
  const heightsRef = useRef(new CacheMap());
  const collectRafRef = useRef<number>();
//FIXME:干啥用的？
  function cancelRaf() {
    raf.cancel(collectRafRef.current);
  }
  // TODO: 滚动条滚动时，该方法触发
  function collectHeight() {
    cancelRaf();
    collectRafRef.current = raf(() => {
      instanceRef.current.forEach((element, key) => {
        if (element && element.offsetParent) {
          const htmlElement = findDOMNode<HTMLElement>(element);
          const { offsetHeight } = htmlElement;
          // 计算每一个item的实际高度，如果不等于当前dom的高度，则直接赋值
          if (heightsRef.current.get(key) !== offsetHeight) {
            heightsRef.current.set(key, htmlElement.offsetHeight);
          }
        }
      });

      // Always trigger update mark to tell parent that should re-calculate heights when resized
      setUpdatedMark((c) => c + 1);
    });
  }
  /**
   * 
   * @param item 当前item的值
   * @param instance 当前渲染的dom元素
   * @return 通过该方法进行删除和添加
   */
  //FIXME:？？？
  // TODO:通过key来判断当前可视区域dom的增或删，如果instance为null，则说明该dom在useChildren中没有了，删除；
  // 如果instance不为null，索命在useChildren中该dom被渲染了，需要添加。
  function setInstanceRef(item: T, instance: HTMLElement) {
    const key = getKey(item);
    console.log('instance', instance)
    const origin = instanceRef.current.get(key);

    if (instance) {
      // 需要添加的dom元素
      instanceRef.current.set(key, instance);
      collectHeight();
    } else {
      //不需要渲染的dom元素删除
      instanceRef.current.delete(key);
    }

    // Instance changed
    if (!origin !== !instance) {
      if (instance) {
        onItemAdd?.(item);
      } else {
        onItemRemove?.(item);
      }
    }
  }

  useEffect(() => {
    return cancelRaf;
  }, []);

  return [setInstanceRef, collectHeight, heightsRef.current, updatedMark];
}
