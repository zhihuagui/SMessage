#pragma once

#include "zdict.h"
#include "decompress.hpp"

class TrainDict {
public:
    TrainDict(const UnCompressBin& bin): mUncompressBin(bin) {
    }

    const std::vector<char>& getRstDict() {
        return mDict;
    }

    void train() {
        addTrainItems(mUncompressBin.getFormulaItems());
        addTrainItems(mUncompressBin.getPropsItems());
        addTrainItems(mUncompressBin.getRestrictionItems());
        addTrainItems(mUncompressBin.getStyleRestrictionItems());
        addTrainString(mUncompressBin.getGroupByTypeAll());
        addTrainString(mUncompressBin.getTypeRestrictionAll());
        mDict.resize(1024 * 1024 * 2);

#ifdef ZDICT_STATIC_LINKING_ONLY
        ZDICT_fastCover_params_t param = {};
        param.k = 1996;
        param.d = 8;
        param.f = 20;
        param.steps = 4;
        param.zParams.notificationLevel = 2;
        auto rstSize = ZDICT_trainFromBuffer_fastCover(mDict.data(), mDict.size(), mSampleBuffer.data(), mSampleSize.data(), mSampleSize.size(), param);
#else
        auto rstSize = ZDICT_trainFromBuffer(mDict.data(), mDict.size(), mSampleBuffer.data(), mSampleSize.data(), mSampleSize.size());
#endif // ZDICT_STATIC_LINKING_ONLY
        mDict.resize(rstSize);
        printf("[NOTE]: The Dict generated with size: %llu\n", rstSize);
    }

private:
    void addTrainItems(const std::vector<DataItem*>& items) {
        size_t totalSize = 0;
        for (auto item : items) {
            totalSize += item->data.size();
        }
        mSampleBuffer.reserve(mSampleBuffer.size() + totalSize);
        for (auto item : items) {
            mSampleBuffer.insert(mSampleBuffer.end(), item->data.begin(), item->data.end());
            mSampleSize.push_back(item->data.size());
        }
    }

    void addTrainString(const std::string& str) {
        mSampleBuffer.reserve(mSampleBuffer.size() + str.size());
        mSampleBuffer.insert(mSampleBuffer.end(), str.begin(), str.end());
        mSampleSize.push_back(str.size());
    }

private:
    const UnCompressBin& mUncompressBin;

    std::vector<char> mDict;
    std::vector<char> mSampleBuffer;
    std::vector<size_t> mSampleSize;
};
