#pragma once

#include "decompress.hpp"
#include "compresstool.hpp"

enum class CompressIndex: uint32_t
{
    MAGVERSION = 0,
    TotalSize,
    FormulaStart,
    FormulaEnd,
    PropsStart,
    PropsEnd,
    RestrictionStart,
    RestrictionEnd,
    StyleRestrictionStart,
    StyleRestrictionEnd,
    GroupByTypeAll,
    TypeRestrictionAll,
    CompressDict,
    ContextStart,
    MAGICCODE = 11018,
    MAJORVERSION = 2,
};

class PDMCompressBuild {
public:
    PDMCompressBuild(const std::vector<char>& dictBuffer):
        mBuffer(nullptr),
        mBufferLen(0),
        mNextBuffer(0),
        mCompressTool(dictBuffer, mCompressLevel) {}

    void startToBuildData() {
        reSizeBuffer(mInitialBufferSize);
        memset(mBuffer, 0, static_cast<size_t>(CompressIndex::ContextStart));
        mNextBuffer = static_cast<int32_t>(CompressIndex::ContextStart) * 4;

        reinterpret_cast<uint16_t *>(mBuffer)[0] = static_cast<uint16_t>(CompressIndex::MAGICCODE);
        reinterpret_cast<uint16_t *>(mBuffer)[1] = static_cast<uint16_t>(CompressIndex::MAJORVERSION);

        auto &dictBuf = mCompressTool.getDictBuffer();
        auto cdictBuf = NoDictTool::compressToTransferBuffer(dictBuf, mCompressLevel);
        auto size = reinterpret_cast<int32_t *>(cdictBuf)[0];

        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::CompressDict)] = mNextBuffer;
        memcpy(mBuffer + mNextBuffer, cdictBuf, size + 4);
        mNextBuffer += size + 4;
    }

    int addFormulaItems(const std::vector<DataItem *> &items)
    {
        mNextBuffer = align(mNextBuffer, 4);
        auto rst = addItemsValue(items, mNextBuffer, mCompressTool);
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::FormulaStart)] = mNextBuffer;
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::FormulaEnd)] = mNextBuffer + 8 * items.size();
        mNextBuffer = rst;
        return rst;
    }

    int addPropsItems(const std::vector<DataItem *> &items)
    {
        mNextBuffer = align(mNextBuffer, 4);
        auto rst = addItemsValue(items, mNextBuffer, mCompressTool);
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::PropsStart)] = mNextBuffer;
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::PropsEnd)] = mNextBuffer + 8 * items.size();
        mNextBuffer = rst;
        return rst;
    }

    int addRestrictionItems(const std::vector<DataItem *> &items)
    {
        mNextBuffer = align(mNextBuffer, 4);
        auto rst = addItemsValue(items, mNextBuffer, mCompressTool);
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::RestrictionStart)] = mNextBuffer;
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::RestrictionEnd)] = mNextBuffer + 8 * items.size();
        mNextBuffer = rst;
        return rst;
    }

    int addStyleRestrictionItems(const std::vector<DataItem *> &items)
    {
        mNextBuffer = align(mNextBuffer, 4);
        auto rst = addItemsValue(items, mNextBuffer, mCompressTool);
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::StyleRestrictionStart)] = mNextBuffer;
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::StyleRestrictionEnd)] = mNextBuffer + 8 * items.size();
        mNextBuffer = rst;
        return rst;
    }

    int addGroupByTypeAll(const std::string &str)
    {
        mNextBuffer = align(mNextBuffer, 4);
        auto rst = addStringItem(str, mNextBuffer, mCompressTool);
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::GroupByTypeAll)] = mNextBuffer;
        mNextBuffer = rst;
        return rst;
    }

    int addTypeRestrictionAll(const std::string &str)
    {
        mNextBuffer = align(mNextBuffer, 4);
        auto rst = addStringItem(str, mNextBuffer, mCompressTool);
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::TypeRestrictionAll)] = mNextBuffer;
        mNextBuffer = rst;
        return rst;
    }

    bool endBuild() {
        reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::TotalSize)] = mNextBuffer;
        return true;
    }

    void saveToBinary(std::string path)
    {
        auto total = reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::TotalSize)];
        if (total > 0) {
            std::ofstream ofs(std::filesystem::absolute(path), std::ios::binary);
            if (ofs.is_open()) {
                ofs.write(reinterpret_cast<const char *>(mBuffer), total);
                ofs.close();
            }
        }
    }

    std::vector<uint8_t> getCopiedBuffer() {
        auto total = reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::TotalSize)];
        if (total > 0) {
            auto result = std::vector<uint8_t>(total);
            memcpy(result.data(), mBuffer, total);
            return result;
        }
        return std::vector<uint8_t>();
    }

private:
    int addItemsValue(std::vector<DataItem *> items, int startOffset, CompressTool &cmps)
    {
        std::sort(items.begin(), items.end(), [](const DataItem *left, const DataItem *right)
                  { return left->numberName < right->numberName; });
        auto localAddrs = reinterpret_cast<int32_t *>(mBuffer) + (startOffset >> 2);
        int bufNext = (items.size() + 1) * 8 + startOffset;
        localAddrs[1] = bufNext;
        for (int i = 0; i < items.size(); i++)
        {
            auto rst = cmps.compressString(items[i]->data);
            localAddrs[i * 2] = items[i]->numberName;
            memoryCopyToBuffer(bufNext, rst);
            localAddrs = reinterpret_cast<int32_t*>(mBuffer) + (startOffset >> 2);
            bufNext += rst.size();
            localAddrs[i * 2 + 3] = bufNext;
        }
        return bufNext;
    }

    int addStringItem(const std::string &str, int offset, CompressTool &cmps)
    {
        auto cmpRst = cmps.compressString(str);
        memoryCopyToBuffer(offset + 4, cmpRst);
        auto strStartAddr = reinterpret_cast<int32_t *>(mBuffer) + (offset >> 2);
        strStartAddr[0] = cmpRst.size();
        return 4 + cmpRst.size() + offset;
    }

    int align(int offset, uint32_t alignment)
    {
        return (offset + (alignment - 1)) & (-alignment);
    }

    inline void memoryCopyToBuffer(int offset, const std::vector<uint8_t>& sourceBuffer) {
        auto requireLen = offset + sourceBuffer.size();
        if (mBufferLen < requireLen) {
            reSizeBuffer(requireLen * 1.5);
        }
        memcpy(mBuffer + offset, sourceBuffer.data(), sourceBuffer.size());
    }

    bool reSizeBuffer(int newSize) {
        if (mBufferLen >= newSize) {
            return true;
        }
        mBuffer = (uint8_t *)realloc(mBuffer, newSize + 4);
        mBufferLen = newSize;
        return true;
    }

    static constexpr int mCompressLevel = 19;
    static constexpr int mInitialBufferSize = 1024 * 1024 * 5;
    uint8_t *mBuffer;
    size_t mBufferLen;
    size_t mNextBuffer;
    CompressTool mCompressTool;
};

class PDMCompressedData {
public:
    explicit PDMCompressedData(uint8_t* buf) : mBuffer(buf), mDecompressTool(nullptr) {
        mIsValid = checkValid();
        if (mIsValid) {
            mIsValid = initialize();
        }
    }

    PDMCompressedData() = delete;
    PDMCompressedData(const PDMCompressedData&) = delete;

    bool initialize() {
        auto dictAddr = reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::CompressDict)];
        auto dictSize = reinterpret_cast<int32_t *>(mBuffer)[dictAddr >> 2];
        auto dictBuffer = NoDictTool::decompress(mBuffer + dictAddr + 4, dictSize);
        if (dictBuffer.size() == 0) {
            return false;
        }
        mDecompressTool = new DecompressTool(dictBuffer);
        return true;
    }

    bool isValid() {
        return mIsValid;
    }

    uint8_t *getFormulaString(int id) {
        return getResourceTransferBuffer(id,
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::FormulaStart)],
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::FormulaEnd)]);
    }

    uint8_t *getPropsString(int id) {
        return getResourceTransferBuffer(id,
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::PropsStart)],
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::PropsEnd)]);
    }

    uint8_t *getRestrictionString(int id) {
        return getResourceTransferBuffer(id,
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::RestrictionStart)],
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::RestrictionEnd)]);
    }

    uint8_t *getStyleRestrictionString(int id) {
        return getResourceTransferBuffer(id,
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::StyleRestrictionStart)],
                                         reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::StyleRestrictionEnd)]);
    }

    uint8_t *getGroupByTypeAll() {
        return getResourceByAddr(reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::GroupByTypeAll)]);
    }

    uint8_t *getTypeRestrictionAll() {
        return getResourceByAddr(reinterpret_cast<int32_t *>(mBuffer)[static_cast<int>(CompressIndex::TypeRestrictionAll)]);
    }

private:
    bool checkValid() {
        if (static_cast<uint16_t>(CompressIndex::MAGICCODE) != reinterpret_cast<uint16_t *>(mBuffer)[0]) {
            return false;
        }
        if (static_cast<uint16_t>(CompressIndex::MAJORVERSION) != reinterpret_cast<uint16_t *>(mBuffer)[1]) {
            return false;
        }
        auto totalSize = reinterpret_cast<int32_t *>(mBuffer)[static_cast<size_t>(CompressIndex::TotalSize)];
        if (totalSize <= 0) {
            return false;
        }
        return true;
    }

    int binSearchValue(int stride, int start, int end, int value) {
        int totalCount = (end - start) / stride;
        int startD4 = start / 4;
        int next = 0;

        int currIdx = totalCount / 2;
        int startIdx = -1;
        int endIdx = totalCount;
        do {
            int curValue = getIndexValue(currIdx, stride, startD4);
            if (curValue == value) {
                return currIdx * stride;
            }
            else if (curValue > value) {
                next = getNext(currIdx, startIdx, endIdx, -1);
                endIdx = currIdx;
                currIdx = next;
            }
            else {
                next = getNext(currIdx, startIdx, endIdx, 1);
                startIdx = currIdx;
                currIdx = next;
            }
        } while (next >= 0);
        return -1;
    }

    inline int getIndexValue(int curr, int stride, int startD4) {
        return reinterpret_cast<int32_t*>(mBuffer)[startD4 + curr * stride / 4];
    }

    inline int getNext(int curr, int pStart, int pEnd, int type) {
        if (type == -1) {
            int step = (curr - pStart) / 2;
            if (!step) {
                return -1;
            }
            return pStart + step;
        }
        else {
            int step = (pEnd - curr) / 2;
            if (!step) {
                return -1;
            }
            return curr + step;
        }
    }

    uint8_t* getResourceTransferBuffer(int id, int indexStart, int indexEnd) {
        if (indexStart <= 0 || indexEnd <= 0) {
            return nullptr;
        }

        auto rLoc = binSearchValue(8, indexStart, indexEnd, id);
        if (rLoc < 0) {
            printf("bin search failed.\n");
            return nullptr;
        }
        rLoc = (rLoc + indexStart) >> 2;

        auto doffset = reinterpret_cast<int32_t *>(mBuffer)[1 + rLoc];
        auto dNxOffset = reinterpret_cast<int32_t *>(mBuffer)[3 + rLoc];
        auto data = mBuffer + doffset;
        auto length = dNxOffset - doffset;
        return mDecompressTool->deCompressToTransferBuffer(data, length);
    }

    uint8_t *getResourceByAddr(int addr){
        auto length = reinterpret_cast<int32_t *>(mBuffer)[(addr >> 2)];
        return mDecompressTool->deCompressToTransferBuffer(mBuffer + addr + 4, length);
    }

    uint8_t *mBuffer;
    bool mIsValid;
    DecompressTool* mDecompressTool;
};
