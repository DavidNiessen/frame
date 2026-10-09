#include "shell.hpp"
namespace frame { HMODULE module = nullptr; std::atomic<long> objects{0}; }
int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) { return SUCCEEDED(frame::launch({}, true)) ? 0 : 1; }
