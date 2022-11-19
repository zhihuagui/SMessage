#pragma once

#include "util.hpp"
#include "compresstool.hpp"

class UnCompressBin {
public:
    UnCompressBin(std::string fileName) {
        mBinBuffer = Util::readFromFile(fileName);
    }

    bool isValid() {
        return mBinBuffer.size() > 0;
    }

    void processBinBuffer();

    const std::vector<DataItem*>& getFormulaItems() const {
        return mFormulaItems;
    }

    const std::vector<DataItem*>& getPropsItems() const {
        return mPropsItems;
    }

    const std::vector<DataItem*>& getRestrictionItems() const {
        return mRestrictionItems;
    }

    const std::vector<DataItem*>& getStyleRestrictionItems() const {
        return mStyleRestrictionItems;
    }

    const std::string& getGroupByTypeAll() const {
        return mGroupByTypeAll;
    }

    const std::string& getTypeRestrictionAll() const {
        return mTypeRestrictionAll;
    }

private:
    std::vector<DataItem*> mFormulaItems;
    std::vector<DataItem*> mPropsItems;
    std::vector<DataItem*> mRestrictionItems;
    std::vector<DataItem*> mStyleRestrictionItems;
    std::string mGroupByTypeAll;
    std::string mTypeRestrictionAll;
    std::vector<char> mBinBuffer;
};
