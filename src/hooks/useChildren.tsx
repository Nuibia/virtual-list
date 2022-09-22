import * as React from 'react';
import type { SharedConfig, RenderFunc } from '../interface';
import { Item } from '../Item';
  /**
   * mergedData item所有数据
   * start 可视区域item开始下标
   * end 可视区域item末尾下标
   * setInstanceRef
   * children  子组件结构，item的壳
   * sharedConfig item key的对象
   */
/**
 * 
 * @param list item所有数据
 * @param startIndex 可视区域item开始下标
 * @param endIndex 可视区域item末尾下标
 * @param setNodeRef 
 * @param renderFunc 子组件结构，item的壳
 * @param param5 item key的对象
 * @returns 
 */
export default function useChildren<T>(
  list: T[],
  startIndex: number,
  endIndex: number,
  setNodeRef: (item: T, element: HTMLElement) => void,
  renderFunc: RenderFunc<T>,
  { getKey }: SharedConfig<T>,
) {
  return list.slice(startIndex, endIndex + 1).map((item, index) => {
    const eleIndex = startIndex + index;
    //TODO: renderFunc (item, index, props) => ReactElement
    const node = renderFunc(item, eleIndex, {
      // style: status === 'MEASURE_START' ? { visibility: 'hidden' } : {},
    }) as React.ReactElement;

    const key = getKey(item);
    return (
      <Item key={key} setRef={ele => setNodeRef(item, ele)}>
        {node}
      </Item>
    );
  });
}
