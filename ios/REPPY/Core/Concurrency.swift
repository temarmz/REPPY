// Declarations adopt this alias in their own source files, so modern Swift can
// check Sendable (without unchecked retroactive conformances). Swift 5.4 keeps
// its portable test target through a source-compatible empty marker protocol.
#if compiler(>=5.5)
public typealias ReppySendable = Sendable
#else
public protocol ReppySendable {}
#endif
