import * as React from 'react';
import classNames from 'classnames';
import raf from 'rc-util/lib/raf';

const MIN_SIZE = 20;
export interface ScrollBarProps {
  prefixCls: string;
  // 列表内容滚动高度
  scrollTop: number;
  // scrollHeight这里指所有的item的高度之和
  scrollHeight: number;
  // 可视区域的高度
  height: number;
  // 所有数据的长度
  count: number;
  // 滚动时，通过syncScrollTop方法设置容器rc-virtual-list-holder的滚动高度

  onScroll: (scrollTop: number) => void;
  onStartMove: () => void;
  onStopMove: () => void;
}

interface ScrollBarState {
  dragging: boolean;
  pageY: number;
  startTop: number;
  visible: boolean;
}

function getPageY(e: React.MouseEvent | MouseEvent | TouchEvent) {
  return 'touches' in e ? e.touches[0].pageY : e.pageY;
}

export default class ScrollBar extends React.Component<ScrollBarProps, ScrollBarState> {
  moveRaf: number = null;

  scrollbarRef = React.createRef<HTMLDivElement>();

  thumbRef = React.createRef<HTMLDivElement>();

  visibleTimeout: ReturnType<typeof setTimeout> = null;

  state: ScrollBarState = {
    dragging: false,
    pageY: null,
    startTop: null,
    visible: false,
  };

  componentDidMount() {
    this.scrollbarRef.current.addEventListener('touchstart', this.onScrollbarTouchStart);
    this.thumbRef.current.addEventListener('touchstart', this.onMouseDown);
  }
  // 组件更新后立即调用
  componentDidUpdate(prevProps: ScrollBarProps) {
    if (prevProps.scrollTop !== this.props.scrollTop) {
      this.delayHidden();
    }
  }

  componentWillUnmount() {
    this.removeEvents();
    clearTimeout(this.visibleTimeout);
  }
  // 两秒没有滚动，滚动条将会消失
  delayHidden = () => {
    clearTimeout(this.visibleTimeout);

    this.setState({ visible: true });
    this.visibleTimeout = setTimeout(() => {
      this.setState({ visible: false });
    }, 2000);
  };

  onScrollbarTouchStart = (e: TouchEvent) => {
    e.preventDefault();
  };

  onContainerMouseDown: React.MouseEventHandler = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // ======================= Clean =======================
  patchEvents = () => {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);

    this.thumbRef.current.addEventListener('touchmove', this.onMouseMove);
    this.thumbRef.current.addEventListener('touchend', this.onMouseUp);
  };

  removeEvents = () => {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);

    this.scrollbarRef.current?.removeEventListener('touchstart', this.onScrollbarTouchStart);

    if (this.thumbRef.current) {
      this.thumbRef.current.removeEventListener('touchstart', this.onMouseDown);
      this.thumbRef.current.removeEventListener('touchmove', this.onMouseMove);
      this.thumbRef.current.removeEventListener('touchend', this.onMouseUp);
    }

    raf.cancel(this.moveRaf);
  };

  // ======================= Thumb =======================
  // 保持鼠标状态在滚动条上
  onMouseDown = (e: React.MouseEvent | TouchEvent) => {
    const { onStartMove } = this.props;

    this.setState({
      dragging: true,
      pageY: getPageY(e),
      startTop: this.getTop(),
    });

    onStartMove();
    this.patchEvents();
    e.stopPropagation();
    e.preventDefault();
  };

  onMouseMove = (e: MouseEvent | TouchEvent) => {
    const { dragging, pageY, startTop } = this.state;
    const { onScroll } = this.props;

    raf.cancel(this.moveRaf);

    if (dragging) {
      const offsetY = getPageY(e) - pageY;
      const newTop = startTop + offsetY;

      const enableScrollRange = this.getEnableScrollRange();
      const enableHeightRange = this.getEnableHeightRange();

      const ptg = enableHeightRange ? newTop / enableHeightRange : 0;
      const newScrollTop = Math.ceil(ptg * enableScrollRange);
      this.moveRaf = raf(() => {
        onScroll(newScrollTop);
      });
    }
  };

  onMouseUp = () => {
    const { onStopMove } = this.props;
    this.setState({ dragging: false });

    onStopMove();
    this.removeEvents();
  };

  // ===================== Calculate =====================
  // 计算滚动条的高度
  getSpinHeight = () => {
    const { height, count } = this.props;
    // 基本高度 = 可视高度/数量总长度*10;
    let baseHeight = (height / count) * 10;
    // 最小20
    baseHeight = Math.max(baseHeight, MIN_SIZE);
    // 最大可视区域高度的一半
    baseHeight = Math.min(baseHeight, height / 2);
    // 向下取整
    return Math.floor(baseHeight);
  };

  getEnableScrollRange = () => {
    const { scrollHeight, height } = this.props;
    // 所有item的高度和 - 可视区域高度
    return scrollHeight - height || 0;
  };

  getEnableHeightRange = () => {
    const { height } = this.props;
    const spinHeight = this.getSpinHeight();
    // 可视区域高度 - 滚动条高度
    return height - spinHeight || 0;
  };

  getTop = () => {
    // 列表内容滚动高度
    const { scrollTop } = this.props;
    // 启用滚动范围
    const enableScrollRange = this.getEnableScrollRange();
    // 使高度范围
    const enableHeightRange = this.getEnableHeightRange();
    // 列表滚动高度或者可以滚动的范围是0
    if (scrollTop === 0 || enableScrollRange === 0) {
      return 0;
    }
    // 组件滚动的高度 / 可以滚动的范围 
    const ptg = scrollTop / enableScrollRange;
    // 乘以 可以滚动的区域
    return ptg * enableHeightRange;
  };

  // Not show scrollbar when height is large than scrollHeight
  //什么时候展示滚动条
  showScroll = (): boolean => {
    const { height, scrollHeight } = this.props;
    return scrollHeight > height;
  };

  // ====================== Render =======================
  render() {
    const { dragging, visible } = this.state;
    const { prefixCls } = this.props;
    const spinHeight = this.getSpinHeight();
    const top = this.getTop();

    const canScroll = this.showScroll();
    const mergedVisible = canScroll && visible;

    return (
      // 滚动条轨道
      <div
        ref={this.scrollbarRef}
        className={classNames(`${prefixCls}-scrollbar`, {
          [`${prefixCls}-scrollbar-show`]: canScroll,
        })}
        style={{
          width: 8,
          top: 0,
          bottom: 0,
          right: 0,
          position: 'absolute',
          //如果超过两秒滚动条没有移动，则滚动条隐藏
          display: mergedVisible ? null : 'none',
        }}
        //鼠标按住 滚动条保持不消失
        onMouseDown={this.onContainerMouseDown}
        //鼠标离开 开启滚动条消失倒计时
        onMouseMove={this.delayHidden}
      >
        {/* 真正的滚动条 */}
        <div
          ref={this.thumbRef}
          className={classNames(`${prefixCls}-scrollbar-thumb`, {
            [`${prefixCls}-scrollbar-thumb-moving`]: dragging,
          })}
          style={{
            width: '100%',
            height: spinHeight,
            top,
            left: 0,
            position: 'absolute',
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: 99,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onMouseDown={this.onMouseDown}
        />
      </div>
    );
  }
}
