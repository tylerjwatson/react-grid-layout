// @flow
import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import {
  autoBindHandlers,
  bottom,
  cloneLayoutItem,
  compactNew,
  getLayoutItem,
  moveElement,
  validateLayout,
  getFirstCollision,
  noop
} from "./utils";
import GridItem from "./GridItem";
import type {
  ChildrenArray as ReactChildrenArray,
  Element as ReactElement
} from "react";

// Types
import type {
  EventCallback,
  CompactType,
  GridResizeEvent,
  GridDragEvent,
  Layout,
  LayoutItem
} from "./utils";

type State = {
  currentDrag: ?LayoutItem,
  activeDrag: ?LayoutItem,
  mounted: boolean,
  oldDragItem: ?LayoutItem,
  resizeItem: ?LayoutItem,
  oldResizeItem: ?LayoutItem
};

export type Props = {
  className: string,
  style: Object,
  width: number,
  autoSize: boolean,
  cols: number,
  draggableCancel: string,
  draggableHandle: string,
  verticalCompact: boolean,
  compactType: ?("horizontal" | "vertical"),
  layout: Layout,
  margin: [number, number],
  containerPadding: [number, number] | null,
  rowHeight: number,
  maxRows: number,
  isDraggable: boolean,
  isResizable: boolean,
  preventCollision: boolean,
  useCSSTransforms: boolean,

  // Callbacks
  onDrag: EventCallback,
  onDragStart: EventCallback,
  onDragStop: EventCallback,
  onResize: EventCallback,
  onResizeStart: EventCallback,
  onResizeStop: EventCallback,
  children: ReactChildrenArray<ReactElement<any>>
};
// End Types

/**
 * A reactive, fluid grid layout with draggable, resizable components.
 */

export default class ReactGridLayout extends React.Component<Props, State> {
  // TODO publish internal ReactClass displayName transform
  static displayName = "ReactGridLayout";

  static propTypes = {
    //
    // Basic props
    //
    className: PropTypes.string,
    style: PropTypes.object,

    // This can be set explicitly. If it is not set, it will automatically
    // be set to the container width. Note that resizes will *not* cause this to adjust.
    // If you need that behavior, use WidthProvider.
    width: PropTypes.number,

    // If true, the container height swells and contracts to fit contents
    autoSize: PropTypes.bool,
    // # of cols.
    cols: PropTypes.number,

    // A selector that will not be draggable.
    draggableCancel: PropTypes.string,
    // A selector for the draggable handler
    draggableHandle: PropTypes.string,

    // Deprecated
    verticalCompact: function(props: Props) {
      if (
        props.verticalCompact === false &&
        process.env.NODE_ENV !== "production"
      ) {
        console.warn(
          // eslint-disable-line no-console
          "`verticalCompact` on <ReactGridLayout> is deprecated and will be removed soon. " +
            'Use `compactType`: "horizontal" | "vertical" | null.'
        );
      }
    },
    // Choose vertical or hotizontal compaction
    compactType: PropTypes.oneOf(["vertical", "horizontal"]),

    // layout is an array of object with the format:
    // {x: Number, y: Number, w: Number, h: Number, i: String}
    layout: function(props: Props) {
      var layout = props.layout;
      // I hope you're setting the data-grid property on the grid items
      if (layout === undefined) return;
      validateLayout(layout, "layout");
    },

    //
    // Grid Dimensions
    //

    // Margin between items [x, y] in px
    margin: PropTypes.arrayOf(PropTypes.number),
    // Padding inside the container [x, y] in px
    containerPadding: PropTypes.arrayOf(PropTypes.number),
    // Rows have a static height, but you can change this based on breakpoints if you like
    rowHeight: PropTypes.number,
    // Default Infinity, but you can specify a max here if you like.
    // Note that this isn't fully fleshed out and won't error if you specify a layout that
    // extends beyond the row capacity. It will, however, not allow users to drag/resize
    // an item past the barrier. They can push items beyond the barrier, though.
    // Intentionally not documented for this reason.
    maxRows: PropTypes.number,

    //
    // Flags
    //
    isDraggable: PropTypes.bool,
    isResizable: PropTypes.bool,
    // If true, grid items won't change position when being dragged over.
    preventCollision: PropTypes.bool,
    // Use CSS transforms instead of top/left
    useCSSTransforms: PropTypes.bool,

    //
    // Callbacks
    //

    // Calls when drag starts. Callback is of the signature (layout, oldItem, newItem, placeholder, e, ?node).
    // All callbacks below have the same signature. 'start' and 'stop' callbacks omit the 'placeholder'.
    onDragStart: PropTypes.func,
    // Calls on each drag movement.
    onDrag: PropTypes.func,
    // Calls when drag is complete.
    onDragStop: PropTypes.func,
    //Calls when resize starts.
    onResizeStart: PropTypes.func,
    // Calls when resize movement happens.
    onResize: PropTypes.func,
    // Calls when resize is complete.
    onResizeStop: PropTypes.func,

    //
    // Other validations
    //

    // Children must not have duplicate keys.
    children: function(props: Props, propName: string) {
      var children = props[propName];

      // Check children keys for duplicates. Throw if found.
      var keys = {};
      React.Children.forEach(children, function(child) {
        if (keys[child.key]) {
          throw new Error(
            'Duplicate child key "' +
              child.key +
              '" found! This will cause problems in ReactGridLayout.'
          );
        }
        keys[child.key] = true;
      });
    }
  };

  static defaultProps = {
    autoSize: true,
    cols: 12,
    className: "",
    style: {},
    draggableHandle: "",
    draggableCancel: "",
    containerPadding: null,
    rowHeight: 150,
    maxRows: Infinity, // infinite vertical growth
    layout: [],
    margin: [10, 10],
    isDraggable: true,
    isResizable: true,
    useCSSTransforms: true,
    verticalCompact: true,
    compactType: "vertical",
    preventCollision: false,
    onLayoutChange: noop,
    onDragStart: noop,
    onDrag: noop,
    onDragStop: noop,
    onResizeStart: noop,
    onResize: noop,
    onResizeStop: noop
  };

  state: State = {
    currentDrag: null,
    activeDrag: null,
    // layout: synchronizeLayoutWithChildren(
    //   this.props.layout,
    //   this.props.children,
    //   this.props.cols,
    //   // Legacy support for verticalCompact: false
    //   this.compactType()
    // ),
    mounted: false,
    resizeItem: null,
    oldDragItem: null,
    oldResizeItem: null
  };

  constructor(props: Props, context: any): void {
    super(props, context);
    autoBindHandlers(this, [
      "onDragStart",
      "onDrag",
      "onDragStop",
      "onResizeStart",
      "onResize",
      "onResizeStop"
    ]);
  }

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.layout.length !== this.props.layout.length) {
      compactNew(nextProps.layout, nextProps.compactType, nextProps.cols);
    }
  }

  componentDidMount() {
    this.setState({ mounted: true });

    compactNew(this.props.layout, this.props.compactType, this.props.cols);
  }

  /**
   * Calculates a pixel value for the container.
   * @return {String} Container height in pixels.
   */
  containerHeight() {
    if (!this.props.autoSize) return;
    const nbRow = bottom(this.props.layout);
    const containerPaddingY = this.props.containerPadding
      ? this.props.containerPadding[1]
      : this.props.margin[1];
    return (
      nbRow * this.props.rowHeight +
      (nbRow - 1) * this.props.margin[1] +
      containerPaddingY * 2 +
      "px"
    );
  }

  compactType(props: ?Object): CompactType {
    if (!props) props = this.props;
    return props.verticalCompact === false ? null : props.compactType;
  }

  /**
   * When dragging starts
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStart(i: string, x: number, y: number, { e, node }: GridDragEvent) {
    const { layout } = this.props;
    var l = getLayoutItem(layout, i);
    if (!l) return;

    this.setState({
      currentDrag: l,
      oldDragItem: cloneLayoutItem(l)
    });

    return this.props.onDragStart(layout, l, l, null, e, node);
  }

  /**
   * Each drag movement create a new dragelement and move the element to the dragged location
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDrag(i: string, x: number, y: number, { e, node }: GridDragEvent) {
    const { currentDrag, oldDragItem, activeDrag } = this.state;
    const { cols, layout } = this.props;
    var l = currentDrag; // getLayoutItem(layout, i);
    if (!l) return;

    // Create placeholder (display only)
    var placeholder =
      activeDrag ||
      ({
        placeholder: true,
        i: i,
        w: 0,
        h: 0,
        x: 0,
        y: 0
      }: LayoutItem);

    placeholder.w = l.w;
    placeholder.h = l.h;
    placeholder.x = l.x;
    placeholder.y = l.y;

    // Move the element to the dragged location.
    const isUserAction = true;
    moveElement(
      layout,
      l,
      x,
      y,
      isUserAction,
      false, // this.props.preventCollision,
      this.compactType(),
      cols
    );

    this.props.onDrag(layout, oldDragItem, l, placeholder, e, node);
    compactNew(layout, this.compactType(), cols);

    this.setState({
      activeDrag: placeholder
    });
  }

  /**
   * When dragging stops, figure out which position the element is closest to and update its x and y.
   * @param  {String} i Index of the child.
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStop(i: string, x: number, y: number, { e, node }: GridDragEvent) {
    const { oldDragItem } = this.state;
    let { layout } = this.props;
    const { cols, preventCollision } = this.props;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    // Move the element here
    const isUserAction = true;
    layout = moveElement(
      layout,
      l,
      x,
      y,
      isUserAction,
      preventCollision,
      this.compactType(),
      cols
    );

    this.props.onDragStop(layout, oldDragItem, l, null, e, node);

    // Set state
    compactNew(this.props.layout, this.compactType(), cols);
    this.setState({
      activeDrag: null,
      oldDragItem: null
    });
  }

  onResizeStart(i: string, w: number, h: number, { e, node }: GridResizeEvent) {
    const { layout } = this.props;
    var l = getLayoutItem(layout, i);
    if (!l) return;

    this.setState({
      resizeItem: l,
      oldResizeItem: l
    });

    this.props.onResizeStart(layout, l, l, null, e, node);
  }

  onResize(i: string, w: number, h: number, { e, node }: GridResizeEvent) {
    const { resizeItem, oldResizeItem } = this.state;
    const { cols, preventCollision, layout } = this.props;
    var l = resizeItem; // getLayoutItem(layout, i);
    if (!l) return;

    // Short circuit if there is a collision in no rearrangement mode.
    if (preventCollision && getFirstCollision(layout, { ...l, w, h })) {
      return;
    }

    // Set new width and height.
    if (l.w !== w || l.h !== h) {
      l.w = w;
      l.h = h;
    }

    // Create placeholder element (display only)
    var placeholder = {
      w: w,
      h: h,
      x: l.x,
      y: l.y,
      static: true,
      i: i
    };

    this.props.onResize(layout, oldResizeItem, l, placeholder, e, node);

    // Re-compact the layout and set the drag placeholder.
    // layout: compact(layout, this.compactType(), cols), //TODO: Compact
    compactNew(layout, this.compactType(), cols);
    cols; // TODO: Remove unused
    this.setState({
      activeDrag: placeholder
    });
  }

  onResizeStop(i: string, w: number, h: number, { e, node }: GridResizeEvent) {
    const { oldResizeItem } = this.state;
    const { layout, cols } = this.props;
    var l = getLayoutItem(layout, i);

    this.props.onResizeStop(layout, oldResizeItem, l, null, e, node);

    // Set state
    compactNew(layout, this.compactType(), cols); //TODO: Compact
    this.setState({
      activeDrag: null,
      oldResizeItem: null
    });

    cols;
  }

  /**
   * Create a placeholder object.
   * @return {Element} Placeholder div.
   */
  placeholder(): ?ReactElement<any> {
    const { activeDrag } = this.state;
    if (!activeDrag) return null;

    const {
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      useCSSTransforms
    } = this.props;

    // {...this.state.activeDrag} is pretty slow, actually
    return (
      <GridItem
        layout={activeDrag}
        className="react-grid-placeholder"
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        isDraggable={false}
        isResizable={false}
        useCSSTransforms={useCSSTransforms}
      >
        <div />
      </GridItem>
    );
  }

  /**
   * Given a grid item, set its style attributes & surround in a <Draggable>.
   * @param  {Element} child React element.
   * @return {Element}       Element wrapped in draggable and properly placed.
   */
  processGridItem(child: ReactElement<any>): ?ReactElement<any> {
    if (!child.key) return;
    const l = getLayoutItem(this.props.layout, String(child.key));
    if (!l) return null;
    const {
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      isDraggable,
      isResizable,
      useCSSTransforms,
      draggableCancel,
      draggableHandle
    } = this.props;
    const { mounted } = this.state;

    // Parse 'static'. Any properties defined directly on the grid item will take precedence.
    const draggable = Boolean(
      !l.static && isDraggable && (l.isDraggable || l.isDraggable == null)
    );
    const resizable = Boolean(
      !l.static && isResizable && (l.isResizable || l.isResizable == null)
    );

    return (
      <GridItem
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        cancel={draggableCancel}
        handle={draggableHandle}
        onDragStop={this.onDragStop}
        onDragStart={this.onDragStart}
        onDrag={this.onDrag}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeStop={this.onResizeStop}
        isDraggable={draggable}
        isResizable={resizable}
        useCSSTransforms={useCSSTransforms && mounted}
        usePercentages={!mounted}
        layout={l}
        minH={l.minH}
        minW={l.minW}
        maxH={l.maxH}
        maxW={l.maxW}
        static={l.static}
      >
        {child}
      </GridItem>
    );
  }

  render() {
    const { className, style } = this.props;

    const mergedClassName = classNames("react-grid-layout", className);
    const mergedStyle = {
      height: this.containerHeight(),
      ...style
    };

    return (
      <div className={mergedClassName} style={mergedStyle}>
        {React.Children.map(this.props.children, child =>
          this.processGridItem(child)
        )}
        {this.placeholder()}
      </div>
    );
  }
}
