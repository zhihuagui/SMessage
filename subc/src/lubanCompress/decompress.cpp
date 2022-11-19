#include <iostream>

#include <vector>
#include <algorithm>
#include <cstdint>

#include <map>
#include <array>
#include "decompress.hpp"
#include "compresstool.hpp"
#include "train.hpp"
#include "recompress.hpp"

void UnCompressBin::processBinBuffer(){
    uint32_t addr = 0;
    int number = 0;
    while (addr < mBinBuffer.size())
    {
        auto namelen = Util::readUInt32(mBinBuffer, addr);
        auto datalen = Util::readUInt32(mBinBuffer, addr + namelen + 4);
        auto daddr = addr + namelen + 8;

        auto rstr = NoDictTool::ungzipToString(mBinBuffer.data() + daddr, datalen);
        auto nameStr = std::string(mBinBuffer.data() + addr + 4, namelen);
        addr = daddr + datalen;

        std::filesystem::path path(nameStr);
        auto typeStr = path.parent_path().filename();
        if (typeStr == "groupbytype")
        {
            mGroupByTypeAll = rstr;
            continue;
        }
        else if (typeStr == "type_restriction")
        {
            mTypeRestrictionAll = rstr;
            continue;
        }

        auto numberName = atoi(path.stem().string().c_str());
        std::vector<DataItem *> *ditems = nullptr;
        if (typeStr == "formula")
        {
            ditems = &mFormulaItems;
        }
        else if (typeStr == "props")
        {
            ditems = &mPropsItems;
        }
        else if (typeStr == "restriction")
        {
            ditems = &mRestrictionItems;
        }
        else if (typeStr == "stylerestriction")
        {
            ditems = &mStyleRestrictionItems;
        }
        else
        {
            throw("Unsupport type.");
        }
        ditems->push_back(new DataItem(numberName, nameStr, rstr));
    }
}
