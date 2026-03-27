import { useToastStore } from '../../src/store/useToastStore';

// Mock requestAnimationFrame (not available in jsdom by default)
global.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 0;
};
global.cancelAnimationFrame = () => {};

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with no toasts', () => {
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('show adds a toast with message and type', () => {
    useToastStore.getState().show('Hello', 'success');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Hello');
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].id).toBeDefined();
  });

  it('show defaults to success type when type is omitted', () => {
    useToastStore.getState().show('Default type message');
    expect(useToastStore.getState().toasts[0].type).toBe('success');
  });

  it('dismiss hides and then removes the toast with the matching id', () => {
    useToastStore.getState().show('A');
    useToastStore.getState().show('B');
    const [first] = useToastStore.getState().toasts;
    useToastStore.getState().dismiss(first.id);
    // After dismiss, toast is hidden (visible: false) but not yet removed
    expect(useToastStore.getState().toasts.find((t) => t.id === first.id)?.visible).toBe(false);
    // After animation timeout (ANIM_MS = 300ms), toast is removed
    jest.advanceTimersByTime(300);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toBe('B');
  });

  it('auto-removes toast after timeout', () => {
    useToastStore.getState().show('Temporary');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    jest.runAllTimers();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
