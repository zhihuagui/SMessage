#pragma once
#include <map>
#include <vector>
#include <filesystem>
#include <fstream>
#include "zlib.h"

struct DataItem {
    DataItem(int number, const std::string& n, const std::string& d) {
        numberName = number;
        name = n;
        data = d;
    }
    DataItem(const DataItem& item) {
        numberName = item.numberName;
        name = item.name;
        data = item.data;
    }
    int numberName;
    std::string name;
    std::string data;
};

struct Util {
    static std::vector<char> readFromFile(std::string fname) {
        auto ibuf = std::ifstream(fname, std::ios::binary | std::ios::ate);
        if (!ibuf.is_open()) {
            printf("The file %s cannot open for read.\n", fname.c_str());
            return std::vector<char>();
        }
        std::streamsize zfsize = ibuf.tellg();
        ibuf.seekg(0, std::ios::beg);
        std::vector<char> dp(zfsize);
        ibuf.read(dp.data(), zfsize);
        ibuf.close();
        return dp;
    }

    static uint32_t readUInt32(std::vector<char> &buf, int offset)
    {
        uint8_t* data = reinterpret_cast<uint8_t*>(buf.data());
        return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | (data[offset + 3]);
    }

    static void saveToDisk(const std::vector<DataItem *> &items)
    {
        std::map<std::string, bool> dirExists;
        for (auto& item : items) {
            auto& name = item->name;
            auto& data = item->data;
            std::filesystem::path fileName(name);
            if (!fileName.is_relative()) {
                printf("The fileName: %s error.\n", name.c_str());
            }
            auto parent = fileName.parent_path();
            if (dirExists.find(parent.string()) == dirExists.end()) {
                if (std::filesystem::exists(parent)) {
                    if (!std::filesystem::is_directory(parent)) {
                        printf("The file %s exists, and is not a directory.\n", parent.string().c_str());
                        return;
                    }
                    dirExists.insert({ parent.string(), true });
                }
                else {
                    dirExists.insert({ parent.string(), std::filesystem::create_directories(parent) });
                }
            }
            std::ofstream ofs(std::filesystem::absolute(fileName));
            if (ofs.is_open()) {
                ofs.write(data.data(), data.size());
                ofs.close();
            }
            else {
                printf("Open the file %s error.\n", fileName.string().c_str());
            }
        }
    }
};
