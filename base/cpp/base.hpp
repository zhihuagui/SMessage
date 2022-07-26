#pragma once

#include <cstdint>
#include <string>

namespace SMessage
{
    template <typename T>
    class BaseMessage {
    public:
        BaseMessage(): _buffer(nullptr) {
        }
        BaseMessage(void *buf): _buffer(buf) {}

    private:
        void* _buffer;
    };

    class MsgString {
    public:
        MsgString(void *buf, int32_t offset): _buffer(buf), _offset(offset), _str(nullptr) {}
        ~MsgString() {
            delete _str;
        }

        const std::string& getUtf8String() {
            if (_str) {
                return *_str;
            }
            int32_t strStart = reinterpret_cast<int32_t*>(_buffer)[_offset / 4];
            int32_t strLen = reinterpret_cast<int32_t*>(_buffer)[_offset / 4 + 1];
            _str = new std::string(reinterpret_cast<const char*>(_buffer) + strStart, static_cast<size_t>(strLen));
            return *_str;
        }

    private:
        void* _buffer;
        int32_t _offset;
        std::string *_str;
    };

    template <typename T>
    class MsgVector {
    public:
        MsgVector(void *buf, int32_t offset): _buffer(buf), _offset(offset) {}

        inline int32_t getStartOffset() {
            return reinterpret_cast<int32_t*>(_buffer)[_offset / 4];
        }

        inline int32_t getSize() {
            return reinterpret_cast<int32_t*>(_buffer)[_offset / 4 + 1];
        }

        T getItem(int32_t index) {
            const int32_t offset = getStartOffset() + itemSize * index;
            return T(_buffer, offset);
        }

        constexpr int32_t itemSize() {
            return sizeof(T);
        }

    private:
        void* _buffer;
        int32_t _offset;
    };

} // namespace SMessage
