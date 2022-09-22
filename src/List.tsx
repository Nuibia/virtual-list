import * as React from 'react';
import { useRef, useState } from 'react';
import classNames from 'classnames';
import Filler from './Filler';
import ScrollBar from './ScrollBar';
import type { RenderFunc, SharedConfig, GetKey } from './interface';
import useChildren from './hooks/useChildren';
import useHeights from './hooks/useHeights';
import useScrollTo from './hooks/useScrollTo';
import useDiffItem from './hooks/useDiffItem';
import useFrameWheel from './hooks/useFrameWheel';
import useMobileTouchMove from './hooks/useMobileTouchMove';
import useOriginScroll from './hooks/useOriginScroll';
import useLayoutEffect from 'rc-util/lib/hooks/useLayoutEffect';

const EMPTY_DATA = [];

const ScrollStyle: React.CSSProperties = {
  overflowY: 'auto',
  overflowAnchor: 'none',
};

export type ScrollAlign = 'top' | 'bottom' | 'auto';
export type ScrollConfig =
  | {
      index: number;
      align?: ScrollAlign;
      offset?: number;
    }
  | {
      key: React.Key;
      align?: ScrollAlign;
      offset?: number;
    };
export type ScrollTo = (arg: number | ScrollConfig) => void;
export type ListRef = {
  scrollTo: ScrollTo;
};

export interface ListProps<T> extends Omit<React.HTMLAttributes<any>, 'children'> {
  prefixCls?: string;
  children: RenderFunc<T>;
  data: T[];
  height?: number;
  itemHeight?: number;
  /** If not match virtual scroll condition, Set List still use height of container. */
  fullHeight?: boolean;
  itemKey: React.Key | ((item: T) => React.Key);
  component?: string | React.FC<any> | React.ComponentClass<any>;
  /** Set `false` will always use real scroll instead of virtual one */
  virtual?: boolean;

  onScroll?: React.UIEventHandler<HTMLElement>;
  /** Trigger when render list item changed */
  onVisibleChange?: (visibleList: T[], fullList: T[]) => void;
}

export function RawList<T>(props: ListProps<T>, ref: React.Ref<ListRef>) {
  const {
    prefixCls = 'rc-virtual-list',
    className = 'jiangniao',
    height,
    itemHeight,
    fullHeight = true,
    style,
    data,
    children,
    itemKey,
    virtual,
    component: Component = 'div',
    onScroll,
    onVisibleChange,
    ...restProps
  } = props;

  // ================================= MISC =================================
  // TODO:jiangniao 是否使用虚拟滚动 virtual为true，且height和itemHeight大于0
  const useVirtual = !!(virtual !== false && height && itemHeight);
  // TODO:jiangniao 是否处于虚拟滚动中 使用虚拟滚动，且有值，并且每一项的高度*数据长度大于可视窗口的高度
  const inVirtual = useVirtual && data && itemHeight * data.length > height;
  // 列表内容滚动高度
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollMoving, setScrollMoving] = useState(false);

  const mergedClassName = classNames(prefixCls, className);
  // mergedData
  const mergedData = data || EMPTY_DATA;
  const componentRef = useRef<HTMLDivElement>();
  const fillerInnerRef = useRef<HTMLDivElement>();
  const scrollBarRef = useRef<any>(); // Hack on scrollbar to enable flash call

  // =============================== Item Key ===============================
  // TODO: 获取每一项的key值，如果设置为id,则数据源data中须有id的值
  const getKey = React.useCallback<GetKey<T>>(
    (item: T) => {
      if (typeof itemKey === 'function') {
        return itemKey(item);
      }
      return item?.[itemKey];
    },
    [itemKey],
  );

  const sharedConfig: SharedConfig<T> = {
    getKey,
  };

  // ================================ Scroll ================================
  // TODO:jiangniao value 滚动条滚动的高度 -1-item的高度总和+1
  // TODO:jiangniao alignedTop component组件顶部的对齐的高度 0-item的高度总和
  // TODO:jiangniao 通过syncScrollTop方法设置容器rc-virtual-list-holder的滚动高度
  function syncScrollTop(newTop: number | ((prev: number) => number)) {
    setScrollTop((origin) => {
      let value: number;
      if (typeof newTop === 'function') {
        value = newTop(origin);
      } else {
        value = newTop;
      }
      const alignedTop = keepInRange(value);
      componentRef.current.scrollTop = alignedTop;
      return alignedTop;
    });
  }

  // ================================ Legacy ================================
  // Put ref here since the range is generate by follow
  const rangeRef = useRef({ start: 0, end: mergedData.length });

  const diffItemRef = useRef<T>();
  const [diffItem] = useDiffItem(mergedData, getKey);
  diffItemRef.current = diffItem;

  // ================================ Height ================================
  /**
   * setInstanceRef 维护可视组件内渲染的dom的map对象，按照key进行增加删除
   * collectHeight 每次组件滚动都会触发的方法，计算每一个item的实际高度
   * heights 通过key来获取指定item的高度 一个map对象，key是item的key，value是item的高
   * heightUpdatedMark 元素内容高度是否变化
   */
  const [setInstanceRef, collectHeight, heights, heightUpdatedMark] = useHeights(
    getKey,
    null,
    null,
  );

  // ========================== Visible Calculation =========================
  // 计算应该显示的元素范围
  /**
   * scroll Height 滚动的高度，也是所有item的高度和
   * start 可视渲染区域开始下标
   * end 可视渲染区域结束下标
   * offset 偏移量，当前开始下标之前所有item的高度之和
   */
  const { scrollHeight, start, end, offset } = React.useMemo(() => {
    if (!useVirtual) {
      return {
        scrollHeight: undefined,
        start: 0,
        end: mergedData.length - 1,
        offset: undefined,
      };
    }

    // Always use virtual scroll bar in avoid shaking
    if (!inVirtual) {
      return {
        scrollHeight: fillerInnerRef.current?.offsetHeight || 0,
        start: 0,
        end: mergedData.length - 1,
        offset: undefined,
      };
    }
    let itemTop = 0;
    let startIndex: number;
    let startOffset: number;
    let endIndex: number;
    //所有数据的长度
    const dataLen = mergedData.length;
    // 通过该for循环，来判断可视化组件要展示的内容的起止下标
    for (let i = 0; i < dataLen; i += 1) {
      // 每一个item
      const item = mergedData[i];
      // 每一个item的key
      const key = getKey(item);
      //TODO:jiangniao 由collectHeight赋值 cacheHeight是用来存放各个item的实际高度，如果存在，使用这个高度，如果不存在，使用传进来的item的高度
      const cacheHeight = heights.get(key);
      // 当前item的底部 
      const currentItemBottom = itemTop + (cacheHeight === undefined ? itemHeight : cacheHeight);

      // Check item top in the range
      // 如果当前的item底部 >= 列表内容滚动高度并且startIndex === undefined
      // 设置当前可视组件要渲染的开始内容下标
      if (currentItemBottom >= scrollTop && startIndex === undefined) {
        console.log('si',i)
        startIndex = i;
        console.log('startOffset',itemTop)
        startOffset = itemTop;
      }

      // Check item bottom in the range. We will render additional one item for motion usage
      // 设置当前可是组建要渲染的内容结束的下标
      if (currentItemBottom > scrollTop + height && endIndex === undefined) {
        console.log('ei',i)
         // 第i个元素（含）之前所有元素的高度 超过了 滚动高度+可视区域的高度，结束索引设为i
        endIndex = i;
      }

      itemTop = currentItemBottom;
    }

    // Fallback to normal if not match. This code should never reach
    /* istanbul ignore next */
    if (startIndex === undefined) {
      startIndex = 0;
      startOffset = 0;
    }
    if (endIndex === undefined) {
      endIndex = mergedData.length - 1;
    }

    // Give cache to improve scroll experience
    endIndex = Math.min(endIndex + 1, mergedData.length);

    return {
      // 这里的itemTop是for循环每一个item的高度之和
      scrollHeight: itemTop,
      start: startIndex,
      end: endIndex,
      // 偏移的高度，是当前渲染组件内容的起始item的前面的item的高度之和,比如当前从第三个内容开始展示，那么该值就是前两个item的高度合
      offset: startOffset,
    };
    // 每次scrollTop变化时，重新计算
  }, [inVirtual, useVirtual, scrollTop, mergedData, heightUpdatedMark, height]);

  rangeRef.current.start = start;
  rangeRef.current.end = end;

  // =============================== In Range ===============================
  const maxScrollHeight = scrollHeight - height;
  const maxScrollHeightRef = useRef(maxScrollHeight);
  maxScrollHeightRef.current = maxScrollHeight;

  function keepInRange(newScrollTop: number) {
    let newTop = newScrollTop;
    if (!Number.isNaN(maxScrollHeightRef.current)) {
      newTop = Math.min(newTop, maxScrollHeightRef.current);
    }
    newTop = Math.max(newTop, 0);
    return newTop;
  }

  const isScrollAtTop = scrollTop <= 0;
  const isScrollAtBottom = scrollTop >= maxScrollHeight;

  const originScroll = useOriginScroll(isScrollAtTop, isScrollAtBottom);

  // ================================ Scroll ================================
  function onScrollBar(newScrollTop: number) {
    const newTop = newScrollTop;
    syncScrollTop(newTop);
  }

  // When data size reduce. It may trigger native scroll event back to fit scroll position
  function onFallbackScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop: newScrollTop } = e.currentTarget;
    if (newScrollTop !== scrollTop) {
      syncScrollTop(newScrollTop);
    }

    // Trigger origin onScroll
    onScroll?.(e);
  }

  // Since this added in global,should use ref to keep update
  const [onRawWheel, onFireFoxScroll] = useFrameWheel(
    // 是否处于虚拟滚动中 使用虚拟滚动，且有值，并且每一项的高度*数据长度大于可视窗口的高度
    useVirtual,
    // 滚动条是否在顶端
    isScrollAtTop,
    // 滚动条是否在底部
    isScrollAtBottom,
    (offsetY) => {
      // offsetY 是滑动的距离
      // top之前的高度
      //通过syncScrollTop方法设置容器rc-virtual-list-holder的滚动高度
      syncScrollTop((top) => {
        const newTop = top + offsetY;
        return newTop;
      });
    },
  );

  // Mobile touch move
  useMobileTouchMove(useVirtual, componentRef, (deltaY, smoothOffset) => {
    if (originScroll(deltaY, smoothOffset)) {
      return false;
    }

    onRawWheel({ preventDefault() {}, deltaY } as WheelEvent);
    return true;
  });

  useLayoutEffect(() => {
    // Firefox only
    function onMozMousePixelScroll(e: Event) {
      if (useVirtual) {
        e.preventDefault();
      }
    }

    componentRef.current.addEventListener('wheel', onRawWheel);
    componentRef.current.addEventListener('DOMMouseScroll', onFireFoxScroll as any);
    componentRef.current.addEventListener('MozMousePixelScroll', onMozMousePixelScroll);

    return () => {
      if (componentRef.current) {
        componentRef.current.removeEventListener('wheel', onRawWheel);
        componentRef.current.removeEventListener('DOMMouseScroll', onFireFoxScroll as any);
        componentRef.current.removeEventListener(
          'MozMousePixelScroll',
          onMozMousePixelScroll as any,
        );
      }
    };
  }, [useVirtual]);

  // ================================= Ref ==================================
  const scrollTo = useScrollTo<T>(
    componentRef,
    mergedData,
    heights,
    itemHeight,
    getKey,
    collectHeight,
    syncScrollTop,
    () => {
      scrollBarRef.current?.delayHidden();
    },
  );

  React.useImperativeHandle(ref, () => ({
    scrollTo,
  }));

  // ================================ Effect ================================
  /** We need told outside that some list not rendered */
  useLayoutEffect(() => {
    if (onVisibleChange) {
      const renderList = mergedData.slice(start, end + 1);

      onVisibleChange(renderList, mergedData);
    }
  }, [start, end, mergedData]);

  // ================================ Render ================================
  /**
   * mergedData item所有数据
   * start 可视区域item开始下标
   * end 可视区域item末尾下标
   * setInstanceRef
   * children  子组件结构，item的壳
   * sharedConfig item key的对象
   */
  const listChildren = useChildren(mergedData, start, end, setInstanceRef, children, sharedConfig);

  let componentStyle: React.CSSProperties = null;
  if (height) {
    componentStyle = { [fullHeight ? 'height' : 'maxHeight']: height, ...ScrollStyle };

    if (useVirtual) {
      componentStyle.overflowY = 'hidden';

      if (scrollMoving) {
        componentStyle.pointerEvents = 'none';
      }
    }
  }

  return (
    // TODO:jiangniao 对应着class为rc-virtual-list jiangniao,是虚拟滚动组件最外层父组件,比Component高度多2，上下俩border
    <div
      style={{
        ...style,
        position: 'relative',
      }}
      className={mergedClassName}
      {...restProps}
    >
      {/* TODO:jiangniao 对应着class为rc-virtual-list-holder这一层 */}
      <Component
        className={`${prefixCls}-holder`}
        style={componentStyle}
        ref={componentRef}
        // 通过监听wheel，动态改变该组件的滚动距离，使得该方法触发
        onScroll={onFallbackScroll}
      >
        {/* TODO:jiangniao 对应着class为rc-virtual-list-holder-inner的div */}
        <Filler
          prefixCls={prefixCls}
          // 所有item加在一起的高度
          height={scrollHeight}
          // 设置可见项目的偏移量。应该是开始项目的顶部位置
          offset={offset}
          // 该方法计算每一个item的实际高度
          onInnerResize={collectHeight}
          ref={fillerInnerRef}
        >
          {/* TODO: jiangniao 在可视区域渲染的item数据 */}
          {listChildren}
        </Filler>
      </Component>
      {/* TODO: jiangniao 对应着class为rc-virtual-list-scrollbar rc-virtual-list-scrollbar-show这一div，为自己实现的一个滚动条 */}
      {useVirtual && (
        <ScrollBar
          // 通过该ref父组件调用子组件的delayHidden方法
          ref={scrollBarRef}
          prefixCls={prefixCls}
          // 列表内容滚动高度
          scrollTop={scrollTop}
          // 可视区域的高度
          height={height}
          // scrollHeight这里指所有的item的高度之和
          scrollHeight={scrollHeight}
          // 所有数据的长度
          count={mergedData.length}
          // 滚动时，通过syncScrollTop方法设置容器rc-virtual-list-holder的滚动高度
          onScroll={onScrollBar}
          onStartMove={() => {
            console.log('jiangniao',11)
            setScrollMoving(true);
          }}
          onStopMove={() => {
            console.log('jiangniao',22)
            setScrollMoving(false);
          }}
        />
      )}
    </div>
  );
}

const List = React.forwardRef<ListRef, ListProps<any>>(RawList);

List.displayName = 'List';

export default List as <Item = any>(
  props: ListProps<Item> & { ref?: React.Ref<ListRef> },
) => React.ReactElement;
